import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/config.js";
import { BridgeRuntime } from "../src/runtime.js";
import { FreebuffSessionClient } from "../src/session.js";
import type { FreebuffAccount, SessionSnapshot } from "../src/types.js";

function account(id: string, token = id): FreebuffAccount {
  return {
    id,
    label: id,
    authToken: token,
    fingerprintId: "",
    fingerprintHash: "",
    enabled: true,
  };
}

function bearerToken(headers: Readonly<Record<string, string | undefined>>): string {
  const authorization = headers.Authorization;
  if (!authorization) throw new Error("missing Authorization header");
  return authorization.replace(/^Bearer /, "");
}

function runtimeWith(
  sessions: (method: "GET" | "POST" | "DELETE", token: string) => Promise<SessionSnapshot>,
): BridgeRuntime {
  const config = loadBridgeConfig({
    FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    FREEBUFF_CREDENTIAL_COOLDOWN_MS: "2500",
  });
  return new BridgeRuntime(
    config,
    new FreebuffSessionClient(config.apiBase, {
      request: async ({ method, headers }) => ({
        status: 200,
        json: await sessions(method, bearerToken(headers)),
      }),
    }),
  );
}

describe("BridgeRuntime admission recovery", () => {
  it("re-admits an exhausted credential after its cooldown expires", async () => {
    const methods: string[] = [];
    const runtime = runtimeWith(async (method) => {
      methods.push(method);
      return {
        status: "active",
        instanceId: "inst-new",
        model: "deepseek/deepseek-v4-flash",
      };
    });
    runtime.states.splice(0, runtime.states.length, {
      account: account("one"),
      disabledUntil: 999,
      inFlight: 0,
      lastSelectedAt: 0,
      session: { status: "rate_limited", retryAfterMs: 0 },
    });

    const admitted = await runtime.admit("deepseek/deepseek-v4-flash", 1000);

    expect(admitted.session?.instanceId).toBe("inst-new");
    expect(methods).toEqual(["POST"]);
    runtime.release(admitted);
  });

  it("heartbeats an existing active session before reusing it", async () => {
    const methods: string[] = [];
    const runtime = runtimeWith(async (method) => {
      methods.push(method);
      return {
        status: "active",
        instanceId: "inst-live",
        model: "deepseek/deepseek-v4-flash",
      };
    });
    runtime.states.splice(0, runtime.states.length, {
      account: account("one"),
      disabledUntil: 0,
      inFlight: 0,
      lastSelectedAt: 0,
      session: {
        status: "active",
        instanceId: "inst-live",
        model: "deepseek/deepseek-v4-flash",
      },
    });

    const admitted = await runtime.admit("deepseek/deepseek-v4-flash", 1000);

    expect(admitted.session?.instanceId).toBe("inst-live");
    expect(methods).toEqual(["GET"]);
    runtime.release(admitted);
  });

  it("tries the next credential when admission is not active", async () => {
    const tokens: string[] = [];
    const runtime = runtimeWith(async (method, token) => {
      expect(method).toBe("POST");
      tokens.push(token);
      if (token === "bad") return { status: "model_locked" };
      return {
        status: "active",
        instanceId: "inst-good",
        model: "openai/gpt-5.6-luna",
      };
    });
    runtime.states.splice(
      0,
      runtime.states.length,
      {
        account: account("one", "bad"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
      {
        account: account("two", "good"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
    );

    const admitted = await runtime.admit("openai/gpt-5.6-luna", 1000);

    expect(admitted.account.id).toBe("two");
    expect(tokens).toEqual(["bad", "good"]);
    runtime.release(admitted);
  });

  it("preserves the final session transport error", async () => {
    const config = loadBridgeConfig({
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async () => ({ status: 500, json: { message: "down" } }),
      }),
    );
    runtime.states.splice(0, runtime.states.length, {
      account: account("one"),
      disabledUntil: 0,
      inFlight: 0,
      lastSelectedAt: 0,
      session: undefined,
    });

    await expect(runtime.admit("deepseek/deepseek-v4-flash", 1000)).rejects.toMatchObject({
      code: "upstream_error",
      upstreamStatus: 500,
    });
  });
});

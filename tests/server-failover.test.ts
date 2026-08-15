import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/config.js";
import { BridgeRuntime } from "../src/runtime.js";
import { createApp } from "../src/server.js";
import { FreebuffSessionClient } from "../src/session.js";
import type { FreebuffAccount } from "../src/types.js";

function account(id: string, token: string): FreebuffAccount {
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

describe("chat credential failover", () => {
  it("retries a pre-visible upstream failure on another credential", async () => {
    const config = loadBridgeConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async ({ headers }) => ({
          status: 200,
          json: {
            status: "active",
            instanceId: bearerToken(headers) === "bad" ? "inst-bad" : "inst-good",
            model: "deepseek/deepseek-v4-flash",
          },
        }),
      }),
    );
    runtime.states.splice(
      0,
      runtime.states.length,
      {
        account: account("bad", "bad"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
      {
        account: account("good", "good"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
    );
    const tokens: string[] = [];
    const app = await createApp({
      config,
      runtime,
      upstream: {
        chat: async ({ headers }) => {
          const token = bearerToken(headers);
          tokens.push(token);
          if (token === "bad") return { status: 500, text: "temporary" };
          return {
            status: 200,
            json: {
              id: "cmp-good",
              choices: [
                {
                  message: { role: "assistant", content: "ok" },
                  finish_reason: "stop",
                },
              ],
            },
          };
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "deepseek/deepseek-v4-flash",
        messages: [{ role: "user", content: "hi" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().choices[0].message.content).toBe("ok");
    expect(tokens).toEqual(["bad", "good"]);
    expect(runtime.states.map((state) => state.inFlight)).toEqual([0, 0]);
    await app.close();
  });

  it("keeps the original upstream error when no other credential is eligible", async () => {
    const config = loadBridgeConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async () => ({
          status: 200,
          json: {
            status: "active",
            instanceId: "inst-bad",
            model: "deepseek/deepseek-v4-flash",
          },
        }),
      }),
    );
    runtime.states.splice(
      0,
      runtime.states.length,
      {
        account: account("bad", "bad"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
      {
        account: account("cooling", "cooling"),
        disabledUntil: Date.now() + 60_000,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
    );
    const app = await createApp({
      config,
      runtime,
      upstream: { chat: async () => ({ status: 500, text: "temporary" }) },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "deepseek/deepseek-v4-flash",
        messages: [{ role: "user", content: "hi" }],
      },
    });

    expect(response.statusCode).toBe(500);
    expect(response.json().error.code).toBe("upstream_error");
    await app.close();
  });

  it("fails over when a streaming response has no body", async () => {
    const config = loadBridgeConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async ({ headers }) => ({
          status: 200,
          json: {
            status: "active",
            instanceId: bearerToken(headers) === "bad" ? "inst-bad" : "inst-good",
            model: "deepseek/deepseek-v4-flash",
          },
        }),
      }),
    );
    runtime.states.splice(
      0,
      runtime.states.length,
      {
        account: account("bad", "bad"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
      {
        account: account("good", "good"),
        disabledUntil: 0,
        inFlight: 0,
        lastSelectedAt: 0,
        session: undefined,
      },
    );
    const tokens: string[] = [];
    const app = await createApp({
      config,
      runtime,
      upstream: {
        chat: async ({ headers }) => {
          const token = bearerToken(headers);
          tokens.push(token);
          if (token === "bad") return { status: 200 };
          return {
            status: 200,
            stream: Readable.from([
              'data: {"choices":[{"delta":{"content":"ok"}}]}\n\n',
              "data: [DONE]\n\n",
            ]),
          };
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: "deepseek/deepseek-v4-flash",
        stream: true,
        messages: [{ role: "user", content: "hi" }],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('"content":"ok"');
    expect(tokens).toEqual(["bad", "good"]);
    await app.close();
  });
});

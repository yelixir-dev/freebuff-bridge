import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/config.js";
import { createApp } from "../src/server.js";
import { BridgeRuntime } from "../src/runtime.js";
import { FreebuffSessionClient } from "../src/session.js";
import type { FreebuffAccount } from "../src/types.js";

const account: FreebuffAccount = {
  id: "user-1",
  label: "Ada",
  authToken: "tok-test",
  fingerprintId: "enhanced-test",
  fingerprintHash: "hash",
  enabled: true,
};

describe("createApp", () => {
  it("serves health and a family dashboard without secrets", async () => {
    const config = loadBridgeConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      BRIDGE_API_KEY: "",
      FREEBUFF_AUTH_TOKENS: "",
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      { ...config },
      new FreebuffSessionClient(config.apiBase, {
        request: async () => ({ status: 200, json: { status: "none", accessTier: "limited" } }),
      }),
    );
    runtime.states.splice(0, runtime.states.length, {
      account,
      disabledUntil: 0,
      inFlight: 0,
      lastSelectedAt: 0,
      session: undefined,
    });
    const app = await createApp({
      config,
      runtime,
      upstream: {
        chat: async () => ({
          status: 200,
          json: { id: "x", choices: [{ message: { content: "ok" } }] },
        }),
      },
    });
    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().version).toMatch(/^0\.0\.149/);
    const dash = await app.inject({ method: "GET", url: "/dashboard" });
    expect(dash.statusCode).toBe(200);
    expect(dash.body).toContain("--ink:#28231f");
    expect(dash.body).toContain(".footerbar #save{background:var(--paper)");
    expect(dash.body).toContain('class="switch"');
    expect(dash.body).toContain('class="brand-row"');
    expect(dash.body).toContain('class="bind-grid"');
    expect(dash.body).toContain('class="bridge-key-prefix"');
    expect(dash.body).toContain("[hidden]{display:none!important}");
    expect(dash.body).toContain("thin_long");
    expect(dash.body).not.toContain("tok-test");
    const script = /<script>([\s\S]*)<\/script>/.exec(dash.body)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script ?? "")).not.toThrow();
    const models = await app.inject({ method: "GET", url: "/v1/models" });
    expect(
      models.json().data.some((row: { id: string }) => row.id === "deepseek/deepseek-v4-flash"),
    ).toBe(true);
    await app.close();
  });

  it("admits a session then forwards a stripped completion", async () => {
    const calls: string[] = [];
    const config = loadBridgeConfig({
      HOST: "127.0.0.1",
      PORT: "0",
      FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async ({ method }) => {
          calls.push(method);
          return {
            status: 200,
            json: {
              status: "active",
              instanceId: "inst-1",
              model: "deepseek/deepseek-v4-flash",
              accessTier: "limited",
            },
          };
        },
      }),
    );
    runtime.states.splice(0, runtime.states.length, {
      account,
      disabledUntil: 0,
      inFlight: 0,
      lastSelectedAt: 0,
      session: undefined,
    });
    let forwarded: unknown;
    const app = await createApp({
      config,
      runtime,
      upstream: {
        chat: async ({ body }) => {
          forwarded = body;
          return {
            status: 200,
            json: { id: "cmp", choices: [{ message: { role: "assistant", content: "hi" } }] },
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
        temperature: 0.4,
        tools: [{ type: "function", function: { name: "Bash" } }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(calls).toContain("POST");
    expect(forwarded).toMatchObject({
      model: "deepseek/deepseek-v4-flash",
      codebuff: { codebuff_metadata: { cost_mode: "free" } },
    });
    expect(forwarded).not.toHaveProperty("temperature");
    expect(forwarded).not.toHaveProperty("tools");
    await app.close();
  });
});

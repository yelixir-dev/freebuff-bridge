import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import { runtimeWithSession, testAccount, testConfig } from "./fixtures.js";

describe("createApp admin surfaces", () => {
  it("serves health and the family dashboard without secrets", async () => {
    const config = testConfig();
    const runtime = runtimeWithSession(config);
    const app = await createApp({ config, runtime });

    const health = await app.inject({ method: "GET", url: "/health" });
    const dashboard = await app.inject({ method: "GET", url: "/dashboard" });
    const models = await app.inject({ method: "GET", url: "/v1/models" });

    expect(health.statusCode).toBe(200);
    expect(health.json().version).toMatch(/^0\.0\.149/);
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain("--ink:#28231f");
    expect(dashboard.body).toContain(".footerbar #save{background:var(--paper)");
    expect(dashboard.body).toContain('class="switch"');
    expect(dashboard.body).toContain('class="brand-row"');
    expect(dashboard.body).toContain('class="bind-grid"');
    expect(dashboard.body).toContain('class="bridge-key-prefix"');
    expect(dashboard.body).toContain("[hidden]{display:none!important}");
    expect(dashboard.body).toContain('id="credHelp"');
    expect(dashboard.body).toContain("heading-info");
    expect(dashboard.body).toContain("thin_long");
    expect(dashboard.body).not.toContain(testAccount.authToken);
    expect(dashboard.body).not.toContain(testAccount.label);
    const script = /<script>([\s\S]*)<\/script>/.exec(dashboard.body)?.[1];
    expect(script).toBeTruthy();
    expect(() => new Function(script ?? "")).not.toThrow();
    expect(
      models.json().data.some((row: { id: string }) => row.id === "deepseek/deepseek-v4-flash"),
    ).toBe(true);
    await app.close();
  });

  it("fails closed for remote access when no bridge key is configured", async () => {
    const config = testConfig({ HOST: "0.0.0.0", BRIDGE_API_KEY: "" });
    const app = await createApp({ config });

    const read = await app.inject({
      method: "GET",
      url: "/admin/config",
      remoteAddress: "10.0.0.10",
    });
    const write = await app.inject({
      method: "PUT",
      url: "/admin/config",
      remoteAddress: "10.0.0.10",
      payload: { bridgeApiKey: "attacker-key" },
    });

    expect(read.statusCode).toBe(401);
    expect(write.statusCode).toBe(401);
    await app.close();
  });

  it("protects remote admin reads when a bridge key is configured", async () => {
    const config = testConfig({ HOST: "0.0.0.0", BRIDGE_API_KEY: "sk-test-secret" });
    const app = await createApp({ config });

    const denied = await app.inject({
      method: "GET",
      url: "/admin/config",
      headers: { host: "bridge.example.test", origin: "https://evil.example" },
      remoteAddress: "10.0.0.10",
    });
    const allowed = await app.inject({
      method: "GET",
      url: "/admin/config",
      headers: {
        host: "bridge.example.test",
        authorization: "Bearer sk-test-secret",
      },
      remoteAddress: "10.0.0.10",
    });

    expect(denied.statusCode).toBe(401);
    expect(denied.json().error.code).toBe("unauthorized");
    expect(denied.headers["access-control-allow-origin"]).toBeUndefined();
    expect(allowed.statusCode).toBe(200);
    await app.close();
  });

  it("allows an authenticated dashboard to rotate the bridge key", async () => {
    const config = testConfig({ BRIDGE_API_KEY: "sk-old" });
    const app = await createApp({ config });

    const rotated = await app.inject({
      method: "PUT",
      url: "/admin/config",
      remoteAddress: "127.0.0.1",
      headers: { authorization: "Bearer sk-old" },
      payload: { bridgeApiKey: "sk-new" },
    });
    const authenticated = await app.inject({
      method: "GET",
      url: "/admin/config",
      headers: { authorization: "Bearer sk-new" },
      remoteAddress: "10.0.0.10",
    });

    expect(rotated.statusCode).toBe(200);
    expect(authenticated.statusCode).toBe(200);
    await app.close();
  });
});

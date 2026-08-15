import { mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "../src/config.js";
import { BridgeRuntime } from "../src/runtime.js";
import { createApp } from "../src/server.js";
import { FreebuffSessionClient } from "../src/session.js";
import { runtimeWithSession, testConfig } from "./fixtures.js";

describe("dashboard configuration persistence", () => {
  it("atomically saves edited credential cards with mode 0600", async () => {
    const directory = mkdtempSync(join(tmpdir(), "freebuff-dashboard-config-"));
    const configPath = join(directory, "config.json");
    const config = testConfig({ FREEBUFF_CONFIG_PATH: configPath });
    const runtime = runtimeWithSession(config);
    const app = await createApp({ config, runtime });

    const response = await app.inject({
      method: "PUT",
      url: "/admin/config",
      payload: {
        server: { host: "127.0.0.1", port: 9993 },
        routing: { policy: "thin_long", maxConcurrent: 2 },
        models: config.models.map(({ id, enabled }) => ({ id, enabled })),
        credentials: [
          { id: "user-1", label: "Renamed", enabled: true },
          { id: "new-account", label: "Second", authToken: "new-secret", enabled: true },
        ],
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      dirty: true,
      restart_required: true,
      credentials: [
        { id: "user-1", label: "Renamed", authTokenConfigured: true },
        { id: "new-account", label: "Second", authTokenConfigured: true },
      ],
    });
    const saved = JSON.parse(readFileSync(configPath, "utf8")) as {
      credentials: Array<{ id: string; name: string; authToken: string }>;
    };
    expect(saved.credentials).toEqual([
      {
        id: "user-1",
        name: "Renamed",
        authToken: "tok-test",
        fingerprintId: "enhanced-test",
        fingerprintHash: "hash",
        enabled: true,
      },
      {
        id: "new-account",
        name: "Second",
        authToken: "new-secret",
        fingerprintId: "",
        fingerprintHash: "",
        enabled: true,
      },
    ]);
    expect(statSync(configPath).mode & 0o777).toBe(0o600);
    const reloaded = loadBridgeConfig({
      HOST: "0.0.0.0",
      PORT: "4444",
      FREEBUFF_CONFIG_PATH: configPath,
      FREEBUFF_CREDENTIALS_PATH: "/tmp/unused-freebuff-cli.json",
    });
    expect(reloaded).toMatchObject({
      host: "127.0.0.1",
      port: 9993,
      routingPolicy: "thin_long",
      maxConcurrent: 2,
      dashboardCredentials: [
        { id: "user-1", label: "Renamed", authToken: "tok-test" },
        { id: "new-account", label: "Second", authToken: "new-secret" },
      ],
    });
    await app.close();
  });

  it("loads an explicitly empty saved credential list without CLI fallback", async () => {
    const directory = mkdtempSync(join(tmpdir(), "freebuff-dashboard-empty-"));
    const configPath = join(directory, "config.json");
    const cliPath = join(directory, "credentials.json");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify({
        server: { host: "127.0.0.1", port: 9993 },
        credentials: [],
      }),
    );
    writeFileSync(cliPath, JSON.stringify({ default: { name: "CLI", authToken: "cli-secret" } }));

    const config = testConfig({
      FREEBUFF_CONFIG_PATH: configPath,
      FREEBUFF_CREDENTIALS_PATH: cliPath,
    });
    const runtime = new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, {
        request: async () => ({ status: 200, json: { status: "active" } }),
      }),
    );

    expect(runtime.states).toHaveLength(0);
  });

  it("invokes restart only after the response has completed", async () => {
    const config = testConfig();
    const runtime = runtimeWithSession(config);
    let resolveRestart!: () => void;
    const restarted = new Promise<void>((resolve) => {
      resolveRestart = resolve;
    });
    const app = await createApp({
      config,
      runtime,
      restart: async () => {
        resolveRestart();
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/admin/restart",
      payload: {},
    });
    await restarted;

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, restart_requested: true });
    const view = await app.inject({ method: "GET", url: "/admin/config" });
    expect(view.json()).toMatchObject({ dirty: false, restart_required: false });
    await app.close();
  });
});

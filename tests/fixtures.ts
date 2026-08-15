import { randomUUID } from "node:crypto";

import { loadBridgeConfig } from "../src/config.js";
import { BridgeRuntime } from "../src/runtime.js";
import { FreebuffSessionClient } from "../src/session.js";
import type { BridgeConfig, FreebuffAccount, SessionSnapshot } from "../src/types.js";

export const testAccount: FreebuffAccount = {
  id: "user-1",
  label: "Ada",
  authToken: "tok-test",
  fingerprintId: "enhanced-test",
  fingerprintHash: "hash",
  enabled: true,
};

export function testConfig(
  overrides: Readonly<Record<string, string | undefined>> = {},
): BridgeConfig {
  return loadBridgeConfig({
    HOST: "127.0.0.1",
    PORT: "0",
    FREEBUFF_AUTH_TOKENS: "",
    FREEBUFF_CONFIG_PATH: `/tmp/missing-freebuff-config-${randomUUID()}.json`,
    FREEBUFF_CREDENTIALS_PATH: "/tmp/missing-freebuff-creds.json",
    ...overrides,
  });
}

export function runtimeWithSession(
  config: BridgeConfig,
  session: (method: "GET" | "POST" | "DELETE") => Promise<SessionSnapshot> = async () => ({
    status: "active",
    instanceId: "inst-1",
    model: "deepseek/deepseek-v4-flash",
    accessTier: "limited",
  }),
): BridgeRuntime {
  const runtime = new BridgeRuntime(
    config,
    new FreebuffSessionClient(config.apiBase, {
      request: async ({ method }) => ({
        status: 200,
        json: await session(method),
      }),
    }),
  );
  runtime.states.splice(0, runtime.states.length, {
    account: testAccount,
    disabledUntil: 0,
    inFlight: 0,
    lastSelectedAt: 0,
    session: undefined,
  });
  return runtime;
}

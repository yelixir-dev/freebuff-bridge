import { redactedPreview } from "./router.js";
import type { BridgeRuntime } from "./runtime.js";
import type { BridgeConfig } from "./types.js";
import { BRIDGE_VERSION } from "./version.js";

export function adminView(runtime: BridgeRuntime, config: BridgeConfig, dirty: boolean) {
  const diagnostics = new Map(runtime.diagnostics().map((item) => [item.id, item]));
  const credentials = config.dashboardCredentials ?? runtime.states.map((state) => state.account);
  return {
    version: BRIDGE_VERSION,
    dirty,
    restart_required: dirty,
    server: { host: config.host, port: config.port },
    routing: {
      policy: config.routingPolicy,
      maxConcurrent: config.maxConcurrent,
      accountCount: credentials.length,
    },
    bridgeApiKey: config.bridgeApiKey ? "sk-[REDACTED]" : "",
    models: config.models,
    credentials: credentials.map((account) => ({
      ...(diagnostics.get(account.id) ?? {
        status: "none",
        remaining: null,
        quota: null,
        disabledUntil: null,
      }),
      id: account.id,
      label: account.label,
      enabled: account.enabled,
      authTokenConfigured: Boolean(account.authToken),
      authTokenPreview: redactedPreview(account.authToken),
    })),
  };
}

export function publicDashboardView(runtime: BridgeRuntime, config: BridgeConfig, dirty: boolean) {
  const view = adminView(runtime, config, dirty);
  return {
    ...view,
    credentials: view.credentials.map((credential) => ({
      ...credential,
      tokenPreview: "",
      authTokenPreview: "",
    })),
  };
}

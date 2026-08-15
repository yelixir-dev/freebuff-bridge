import { homedir } from "node:os";
import { join } from "node:path";

import { ConfigError, ModelNotAllowedError } from "./errors.js";
import { DEFAULT_MODEL_ID, MODEL_CATALOG, findModel } from "./model-catalog.js";
import { ROUTING_POLICIES, type BridgeConfig, type RoutingPolicy } from "./types.js";

function envString(env: NodeJS.ProcessEnv, key: string, fallback: string): string {
  const value = env[key];
  return value && value.trim() ? value.trim() : fallback;
}

function envNumber(env: NodeJS.ProcessEnv, key: string, fallback: number): number {
  const raw = env[key];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parsePolicy(value: string): RoutingPolicy {
  if ((ROUTING_POLICIES as readonly string[]).includes(value)) return value as RoutingPolicy;
  throw new ConfigError(`Unknown routing policy: ${value}`);
}

export function defaultCredentialsPath(): string {
  return join(homedir(), ".config", "manicode", "credentials.json");
}

export function loadBridgeConfig(env: NodeJS.ProcessEnv = process.env): BridgeConfig {
  const extra = envString(env, "FREEBUFF_AUTH_TOKENS", "");
  return {
    host: envString(env, "HOST", "127.0.0.1"),
    port: envNumber(env, "PORT", 9993),
    bridgeApiKey: envString(env, "BRIDGE_API_KEY", ""),
    apiBase: envString(env, "FREEBUFF_API_BASE", "https://www.codebuff.com"),
    cliVersion: envString(env, "FREEBUFF_CLI_VERSION", "0.0.149"),
    defaultModel: envString(env, "FREEBUFF_DEFAULT_MODEL", DEFAULT_MODEL_ID),
    routingPolicy: parsePolicy(envString(env, "FREEBUFF_ROUTING_POLICY", "thin_long")),
    maxConcurrent: envNumber(env, "FREEBUFF_MAX_CONCURRENT", 0),
    cooldownMs: envNumber(env, "FREEBUFF_CREDENTIAL_COOLDOWN_MS", 60_000),
    timeoutMs: envNumber(env, "FREEBUFF_TIMEOUT_MS", 600_000),
    requestBodyLimitBytes: envNumber(env, "REQUEST_BODY_LIMIT_BYTES", 1_048_576),
    rateLimitMax: envNumber(env, "RATE_LIMIT_MAX", 60),
    rateLimitWindow: envString(env, "RATE_LIMIT_WINDOW", "1 minute"),
    logLevel: envString(env, "LOG_LEVEL", "info"),
    corsOrigin: envString(env, "CORS_ORIGIN", ""),
    credentialsPath: envString(env, "FREEBUFF_CREDENTIALS_PATH", defaultCredentialsPath()),
    extraTokens: extra
      ? extra
          .split(",")
          .map((token) => token.trim())
          .filter(Boolean)
      : [],
    models: MODEL_CATALOG,
  };
}

export function resolveModel(config: BridgeConfig, requested: string): string {
  const id = requested === "default" ? config.defaultModel : requested;
  const catalog = config.models.find((model) => model.id === id) ?? findModel(id);
  if (!catalog || !catalog.enabled) throw new ModelNotAllowedError(id);
  return catalog.id;
}

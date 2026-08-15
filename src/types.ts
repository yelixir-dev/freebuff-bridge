export type OpenAIRole = "developer" | "system" | "user" | "assistant" | "tool";

export interface OpenAIChatMessage {
  readonly role: OpenAIRole;
  readonly content?: string | ReadonlyArray<Record<string, unknown>> | null;
  readonly name?: string;
  readonly tool_call_id?: string;
}

export interface OpenAIChatCompletionRequest {
  readonly model: string;
  readonly messages: readonly OpenAIChatMessage[];
  readonly stream?: boolean;
  readonly max_tokens?: number;
  readonly temperature?: number;
  readonly top_p?: number;
  readonly tools?: readonly unknown[];
  readonly stream_options?: { readonly include_usage?: boolean };
}

export const ROUTING_POLICIES = ["thin_long", "short_thick"] as const;
export type RoutingPolicy = (typeof ROUTING_POLICIES)[number];

export interface FreebuffAccount {
  readonly id: string;
  readonly label: string;
  readonly authToken: string;
  readonly fingerprintId: string;
  readonly fingerprintHash: string;
  readonly enabled: boolean;
}

export interface SessionRateLimit {
  readonly model: string;
  readonly limit: number;
  readonly recentCount: number;
  readonly resetAt: string;
  readonly period: "pacific_day" | "pacific_week";
}

export type SessionStatus =
  | "none"
  | "active"
  | "ended"
  | "rate_limited"
  | "spend_limited"
  | "ip_capped"
  | "model_locked"
  | "banned"
  | "country_blocked"
  | "waiting_room";

export interface SessionSnapshot {
  readonly status: SessionStatus;
  readonly instanceId?: string;
  readonly model?: string;
  readonly admittedAt?: string;
  readonly expiresAt?: string;
  readonly remainingMs?: number;
  readonly accessTier?: "full" | "limited";
  readonly rateLimit?: SessionRateLimit;
  readonly rateLimitsByModel?: Readonly<Record<string, SessionRateLimit>>;
  readonly retryAfterMs?: number;
  readonly message?: string;
}

export interface ModelOption {
  readonly id: string;
  readonly label: string;
  readonly provider: string;
  readonly premium: boolean;
  readonly limitedOk: boolean;
  readonly enabled: boolean;
  readonly notes?: string;
}

export interface BridgeConfig {
  readonly host: string;
  readonly port: number;
  readonly bridgeApiKey: string;
  readonly apiBase: string;
  readonly cliVersion: string;
  readonly defaultModel: string;
  readonly routingPolicy: RoutingPolicy;
  readonly maxConcurrent: number;
  readonly cooldownMs: number;
  readonly timeoutMs: number;
  readonly requestBodyLimitBytes: number;
  readonly rateLimitMax: number;
  readonly rateLimitWindow: string;
  readonly logLevel: string;
  readonly corsOrigin: string;
  readonly credentialsPath: string;
  readonly extraTokens: readonly string[];
  readonly models: readonly ModelOption[];
}

export interface CredentialState {
  readonly account: FreebuffAccount;
  disabledUntil: number;
  inFlight: number;
  lastSelectedAt: number;
  session: SessionSnapshot | undefined;
}

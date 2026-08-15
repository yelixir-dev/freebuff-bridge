export const CHAT_USER_AGENT = "ai-sdk/openai-compatible/3.0.25/codebuff";

export const FREEBUFF_INSTANCE_HEADER = "x-freebuff-instance-id";
export const FREEBUFF_MODEL_HEADER = "x-freebuff-model";
export const FREEBUFF_COMPACT_HEADER = "x-freebuff-compact-session";
export const FREEBUFF_HEARTBEAT_HEADER = "x-freebuff-heartbeat";

export const HEARTBEAT_INTERVAL_MS = 45_000;

export interface OfficialHeaders {
  readonly Authorization: string;
  readonly "user-agent": string;
  readonly "x-freebuff-instance-id"?: string;
  readonly "x-freebuff-model"?: string;
  readonly "x-freebuff-compact-session"?: string;
  readonly "x-freebuff-heartbeat"?: string;
}

export function officialChatHeaders(input: {
  readonly token: string;
  readonly instanceId?: string;
  readonly model?: string;
}): OfficialHeaders {
  return {
    Authorization: `Bearer ${input.token}`,
    "user-agent": CHAT_USER_AGENT,
    ...(input.instanceId ? { [FREEBUFF_INSTANCE_HEADER]: input.instanceId } : {}),
    ...(input.model ? { [FREEBUFF_MODEL_HEADER]: input.model } : {}),
  };
}

export function officialSessionHeaders(input: {
  readonly token: string;
  readonly method: "GET" | "POST" | "DELETE";
  readonly instanceId?: string;
  readonly model?: string;
  readonly heartbeat?: boolean;
  readonly compact?: boolean;
}): OfficialHeaders {
  return {
    Authorization: `Bearer ${input.token}`,
    "user-agent": CHAT_USER_AGENT,
    ...(input.method === "GET" && input.instanceId
      ? { [FREEBUFF_INSTANCE_HEADER]: input.instanceId }
      : {}),
    ...(input.method === "GET" && input.compact ? { [FREEBUFF_COMPACT_HEADER]: "1" } : {}),
    ...(input.method === "GET" && input.heartbeat ? { [FREEBUFF_HEARTBEAT_HEADER]: "1" } : {}),
    ...(input.method === "POST" && input.model ? { [FREEBUFF_MODEL_HEADER]: input.model } : {}),
  };
}

export function chatMetadata(input: { readonly runId: string; readonly clientId: string }): {
  readonly codebuff: { readonly codebuff_metadata: Record<string, string> };
} {
  return {
    codebuff: {
      codebuff_metadata: {
        run_id: input.runId,
        client_id: input.clientId,
        cost_mode: "free",
      },
    },
  };
}

export function stripSampling(body: Record<string, unknown>): Record<string, unknown> {
  const omit = new Set(["temperature", "top_p", "max_tokens", "tools", "tool_choice"]);
  return Object.fromEntries(Object.entries(body).filter(([key]) => !omit.has(key)));
}

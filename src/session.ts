import { classifySessionStatus } from "./quota.js";
import { officialSessionHeaders } from "./identity.js";
import type { SessionRateLimit, SessionSnapshot } from "./types.js";

export interface SessionTransport {
  request(input: {
    readonly method: "GET" | "POST" | "DELETE";
    readonly url: string;
    readonly headers: Record<string, string>;
  }): Promise<{ readonly status: number; readonly json: unknown }>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseRateLimit(value: unknown): SessionRateLimit | undefined {
  const record = asRecord(value);
  const model = asString(record["model"]);
  const limit = asNumber(record["limit"]);
  const recentCount = asNumber(record["recentCount"]);
  const resetAt = asString(record["resetAt"]);
  const period = record["period"];
  if (!model || limit === undefined || recentCount === undefined || !resetAt) return undefined;
  if (period !== "pacific_day" && period !== "pacific_week") return undefined;
  return { model, limit, recentCount, resetAt, period };
}

export function parseSessionSnapshot(json: unknown): SessionSnapshot {
  const record = asRecord(json);
  const status = classifySessionStatus(asString(record["status"]) ?? "none");
  const rateLimitsByModel = record["rateLimitsByModel"];
  let parsedByModel: Record<string, SessionRateLimit> | undefined;
  if (rateLimitsByModel && typeof rateLimitsByModel === "object") {
    parsedByModel = {};
    for (const [key, value] of Object.entries(rateLimitsByModel)) {
      const parsed = parseRateLimit(value);
      if (parsed) parsedByModel[key] = parsed;
    }
  }
  const instanceId = asString(record["instanceId"]);
  const model = asString(record["model"]);
  const admittedAt = asString(record["admittedAt"]);
  const expiresAt = asString(record["expiresAt"]);
  const remainingMs = asNumber(record["remainingMs"]);
  const rateLimit = parseRateLimit(record["rateLimit"]);
  const retryAfterMs = asNumber(record["retryAfterMs"]);
  const message = asString(record["message"]);
  const accessTier = record["accessTier"];
  return {
    status,
    ...(instanceId ? { instanceId } : {}),
    ...(model ? { model } : {}),
    ...(admittedAt ? { admittedAt } : {}),
    ...(expiresAt ? { expiresAt } : {}),
    ...(remainingMs !== undefined ? { remainingMs } : {}),
    ...(accessTier === "full" || accessTier === "limited" ? { accessTier } : {}),
    ...(rateLimit ? { rateLimit } : {}),
    ...(parsedByModel ? { rateLimitsByModel: parsedByModel } : {}),
    ...(retryAfterMs !== undefined ? { retryAfterMs } : {}),
    ...(message ? { message } : {}),
  };
}

export class FreebuffSessionClient {
  public constructor(
    private readonly apiBase: string,
    private readonly transport: SessionTransport,
  ) {}

  public async call(
    method: "GET" | "POST" | "DELETE",
    token: string,
    opts: {
      readonly instanceId?: string;
      readonly model?: string;
      readonly heartbeat?: boolean;
      readonly compact?: boolean;
    } = {},
  ): Promise<SessionSnapshot> {
    const headers = officialSessionHeaders({ token, method, ...opts });
    const response = await this.transport.request({
      method,
      url: `${this.apiBase.replace(/\/$/, "")}/api/v1/freebuff/session`,
      headers: { ...headers },
    });
    if (response.status === 404) return { status: "none" };
    return parseSessionSnapshot(response.json);
  }
}

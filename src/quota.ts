import { assertNever } from "./assert-never.js";
import type { SessionRateLimit, SessionSnapshot, SessionStatus } from "./types.js";

export function remainingSessions(limit: SessionRateLimit | undefined): number | undefined {
  if (!limit) return undefined;
  return Math.max(0, limit.limit - limit.recentCount);
}

export function quotaForModel(
  snapshot: SessionSnapshot | undefined,
  model: string,
): SessionRateLimit | undefined {
  if (!snapshot) return undefined;
  const byModel = snapshot.rateLimitsByModel;
  if (byModel && byModel[model]) return byModel[model];
  if (snapshot.rateLimit?.model === model) return snapshot.rateLimit;
  if (snapshot.rateLimit) return snapshot.rateLimit;
  if (!byModel) return undefined;
  return Object.values(byModel)[0];
}

export function isQuotaExhausted(snapshot: SessionSnapshot | undefined, model: string): boolean {
  if (!snapshot) return false;
  if (snapshot.status === "rate_limited" || snapshot.status === "spend_limited") return true;
  const remaining = remainingSessions(quotaForModel(snapshot, model));
  return remaining !== undefined && remaining <= 0;
}

export function cooldownUntil(snapshot: SessionSnapshot, now: number): number {
  if (snapshot.retryAfterMs !== undefined) return now + snapshot.retryAfterMs;
  const resetAt =
    snapshot.rateLimit?.resetAt ?? quotaForModel(snapshot, snapshot.model ?? "")?.resetAt;
  if (resetAt) {
    const parsed = Date.parse(resetAt);
    if (Number.isFinite(parsed) && parsed > now) return parsed;
  }
  return now + 60_000;
}

export function classifySessionStatus(status: string): SessionStatus {
  switch (status) {
    case "none":
    case "active":
    case "ended":
    case "rate_limited":
    case "spend_limited":
    case "ip_capped":
    case "model_locked":
    case "banned":
    case "country_blocked":
      return status;
    case "waiting_room_required":
    case "waiting_room_queued":
    case "waiting_room":
      return "waiting_room";
    default:
      return "none";
  }
}

export function sessionEndsAdmission(status: SessionStatus): boolean {
  switch (status) {
    case "rate_limited":
    case "spend_limited":
    case "ip_capped":
    case "banned":
    case "country_blocked":
      return true;
    case "none":
    case "active":
    case "ended":
    case "model_locked":
    case "waiting_room":
      return false;
    default:
      return assertNever(status);
  }
}

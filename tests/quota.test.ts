import { describe, expect, it } from "vitest";

import {
  classifySessionStatus,
  cooldownUntil,
  isQuotaExhausted,
  remainingSessions,
} from "../src/quota.js";
import type { SessionSnapshot } from "../src/types.js";

const limit = {
  model: "deepseek/deepseek-v4-flash",
  limit: 6,
  recentCount: 1,
  resetAt: "2026-08-16T07:00:00.000Z",
  period: "pacific_day" as const,
};

describe("remainingSessions", () => {
  it("subtracts used units from the daily limit", () => {
    expect(remainingSessions(limit)).toBe(5);
    expect(remainingSessions({ ...limit, recentCount: 6 })).toBe(0);
    expect(remainingSessions(undefined)).toBeUndefined();
  });
});

describe("isQuotaExhausted", () => {
  it("treats rate_limited as exhausted even if counts are missing", () => {
    const snapshot: SessionSnapshot = { status: "rate_limited" };
    expect(isQuotaExhausted(snapshot, limit.model)).toBe(true);
  });

  it("is not exhausted when five of six sessions remain", () => {
    const snapshot: SessionSnapshot = { status: "none", rateLimit: limit };
    expect(isQuotaExhausted(snapshot, limit.model)).toBe(false);
  });
});

describe("classifySessionStatus", () => {
  it("collapses waiting-room variants", () => {
    expect(classifySessionStatus("waiting_room_required")).toBe("waiting_room");
    expect(classifySessionStatus("waiting_room_queued")).toBe("waiting_room");
  });
});

describe("cooldownUntil", () => {
  it("prefers retryAfterMs then resetAt", () => {
    expect(cooldownUntil({ status: "rate_limited", retryAfterMs: 2500 }, 1000)).toBe(3500);
    expect(
      cooldownUntil(
        { status: "rate_limited", rateLimit: limit },
        Date.parse("2026-08-15T00:00:00Z"),
      ),
    ).toBe(Date.parse(limit.resetAt));
  });
});

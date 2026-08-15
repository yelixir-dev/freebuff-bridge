import { describe, expect, it } from "vitest";

import { NoAvailableCredentialError } from "../src/errors.js";
import { markSelected, selectCredential, thinLongConcurrency } from "../src/router.js";
import type { CredentialState, FreebuffAccount } from "../src/types.js";

function account(id: string): FreebuffAccount {
  return {
    id,
    label: id,
    authToken: `tok-${id}`,
    fingerprintId: "",
    fingerprintHash: "",
    enabled: true,
  };
}

function state(id: string, extras: Partial<CredentialState> = {}): CredentialState {
  return {
    account: account(id),
    disabledUntil: 0,
    inFlight: 0,
    lastSelectedAt: 0,
    session: undefined,
    ...extras,
  };
}

describe("thinLongConcurrency", () => {
  it("keeps one lane until five accounts, then n/5", () => {
    expect(thinLongConcurrency(1)).toBe(1);
    expect(thinLongConcurrency(4)).toBe(1);
    expect(thinLongConcurrency(5)).toBe(1);
    expect(thinLongConcurrency(9)).toBe(1);
    expect(thinLongConcurrency(10)).toBe(2);
  });
});

describe("selectCredential", () => {
  it("drains the first remaining account in thin_long", () => {
    const states = [state("a", { lastSelectedAt: 20 }), state("b", { lastSelectedAt: 5 })];
    expect(
      selectCredential(states, "deepseek/deepseek-v4-flash", "thin_long", 100, {
        maxConcurrent: 1,
      }).account.id,
    ).toBe("a");
  });

  it("round-robins in short_thick", () => {
    const states = [state("a", { lastSelectedAt: 20 }), state("b", { lastSelectedAt: 5 })];
    expect(
      selectCredential(states, "deepseek/deepseek-v4-flash", "short_thick", 100, {
        maxConcurrent: 5,
      }).account.id,
    ).toBe("b");
  });

  it("skips an account whose daily tickets are gone", () => {
    const states = [
      state("spent", {
        session: {
          status: "rate_limited",
          rateLimit: {
            model: "deepseek/deepseek-v4-flash",
            limit: 6,
            recentCount: 6,
            resetAt: "2099-01-01T00:00:00Z",
            period: "pacific_day",
          },
        },
      }),
      state("fresh"),
    ];
    expect(
      selectCredential(states, "deepseek/deepseek-v4-flash", "thin_long", 100, {
        maxConcurrent: 1,
      }).account.id,
    ).toBe("fresh");
  });

  it("throws when the concurrent cap is already full", () => {
    const states = [state("a", { inFlight: 1 }), state("b")];
    expect(() => selectCredential(states, "m", "short_thick", 1, { maxConcurrent: 1 })).toThrow(
      NoAvailableCredentialError,
    );
  });
});

describe("markSelected", () => {
  it("holds the single per-account slot", () => {
    const current = state("a");
    markSelected(current, 10);
    expect(current.inFlight).toBe(1);
    expect(current.lastSelectedAt).toBe(10);
  });
});

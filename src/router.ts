import { NoAvailableCredentialError } from "./errors.js";
import { cooldownUntil, isQuotaExhausted } from "./quota.js";
import type { CredentialState, RoutingPolicy, SessionSnapshot } from "./types.js";

export const THIN_LONG_CHAIN = 5;

export function thinLongConcurrency(accountCount: number): number {
  return Math.max(1, Math.floor(accountCount / THIN_LONG_CHAIN));
}

export function totalInFlight(states: readonly CredentialState[]): number {
  return states.reduce((sum, state) => sum + state.inFlight, 0);
}

export function eligibleStates(
  states: readonly CredentialState[],
  model: string,
  now: number,
  excludeIds: ReadonlySet<string> = new Set(),
): CredentialState[] {
  return states.filter((state) => {
    if (!state.account.enabled) return false;
    if (excludeIds.has(state.account.id)) return false;
    if (state.disabledUntil > now) return false;
    if (state.inFlight >= 1) return false;
    return !isQuotaExhausted(state.session, model);
  });
}

export function selectCredential(
  states: readonly CredentialState[],
  model: string,
  policy: RoutingPolicy,
  now: number,
  options: {
    readonly excludeIds?: ReadonlySet<string>;
    readonly maxConcurrent: number;
  },
): CredentialState {
  if (totalInFlight(states) >= options.maxConcurrent) {
    throw new NoAvailableCredentialError("concurrency saturated");
  }
  const eligible = eligibleStates(states, model, now, options.excludeIds);
  const first = eligible[0];
  if (!first) throw new NoAvailableCredentialError();
  if (policy === "thin_long") return first;
  return (
    [...eligible].sort((left, right) => left.lastSelectedAt - right.lastSelectedAt)[0] ?? first
  );
}

export function markSelected(state: CredentialState, now: number): void {
  state.inFlight += 1;
  state.lastSelectedAt = now;
}

export function markReleased(state: CredentialState): void {
  state.inFlight = Math.max(0, state.inFlight - 1);
}

export function markQuotaFailure(
  state: CredentialState,
  snapshot: SessionSnapshot,
  now: number,
  fallbackMs = 60_000,
): void {
  state.session = snapshot;
  state.disabledUntil = cooldownUntil(snapshot, now, fallbackMs);
}

export function redactedPreview(token: string): string {
  if (token.length <= 8) return "••••";
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

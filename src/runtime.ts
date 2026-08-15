import { accountsFromTokens, loadCredentialsFile } from "./credentials.js";
import { UpstreamError } from "./errors.js";
import { readBoundedText } from "./http-body.js";
import { cooldownUntil, isQuotaExhausted, quotaForModel, remainingSessions } from "./quota.js";
import {
  markQuotaFailure,
  markReleased,
  markSelected,
  redactedPreview,
  selectCredential,
  thinLongConcurrency,
} from "./router.js";
import type { FreebuffSessionClient, SessionTransport } from "./session.js";
import type { BridgeConfig, CredentialState, FreebuffAccount } from "./types.js";

export function loadAccounts(config: BridgeConfig): FreebuffAccount[] {
  const fromFile = config.dashboardCredentials ?? loadCredentialsFile(config.credentialsPath);
  const extras = accountsFromTokens(config.extraTokens);
  const seen = new Set(fromFile.map((account) => account.authToken));
  return [...fromFile, ...extras.filter((account) => !seen.has(account.authToken))];
}

export function createStates(accounts: readonly FreebuffAccount[]): CredentialState[] {
  return accounts.map((account) => ({
    account,
    disabledUntil: 0,
    inFlight: 0,
    lastSelectedAt: 0,
    session: undefined,
  }));
}

export class BridgeRuntime {
  public readonly states: CredentialState[];
  public constructor(
    public config: BridgeConfig,
    private readonly sessions: FreebuffSessionClient,
  ) {
    this.states = createStates(loadAccounts(config));
  }

  public maxConcurrent(): number {
    const n = this.states.filter((state) => state.account.enabled).length;
    if (this.config.routingPolicy === "thin_long") return thinLongConcurrency(n);
    return this.config.maxConcurrent > 0
      ? Math.min(this.config.maxConcurrent, Math.max(1, n))
      : Math.max(1, n);
  }

  public addAccount(account: FreebuffAccount): void {
    if (this.states.some((state) => state.account.authToken === account.authToken)) return;
    this.states.push({
      account,
      disabledUntil: 0,
      inFlight: 0,
      lastSelectedAt: 0,
      session: undefined,
    });
  }

  public diagnostics() {
    return this.states.map((state) => {
      const model = this.config.defaultModel;
      const quota = quotaForModel(state.session, model);
      return {
        id: state.account.id,
        label: state.account.label,
        enabled: state.account.enabled,
        tokenPreview: redactedPreview(state.account.authToken),
        status: state.session?.status ?? "none",
        accessTier: state.session?.accessTier,
        message: state.session?.message,
        quota,
        remaining: remainingSessions(quota),
        disabledUntil: state.disabledUntil || null,
      };
    });
  }

  public async refreshAll(): Promise<void> {
    await Promise.all(
      this.states.map(async (state) => {
        try {
          const instanceId = state.session?.instanceId;
          state.session = await this.sessions.call("GET", state.account.authToken, {
            ...(instanceId ? { instanceId } : {}),
            compact: false,
          });
          state.disabledUntil = isQuotaExhausted(state.session, this.config.defaultModel)
            ? cooldownUntil(state.session, Date.now(), this.config.cooldownMs)
            : 0;
        } catch (error) {
          // no-excuse-ok: catch — one invalid credential must not hide every dashboard card
          state.session = {
            status: "none",
            message: error instanceof Error ? error.message : String(error),
          };
          state.disabledUntil = Date.now() + this.config.cooldownMs;
        }
      }),
    );
  }

  public async admit(
    model: string,
    now = Date.now(),
    excluded: ReadonlySet<string> = new Set(),
  ): Promise<CredentialState> {
    const exclude = new Set(excluded);
    let lastError: UpstreamError | undefined;
    for (const state of this.states) {
      if (state.disabledUntil <= now && isQuotaExhausted(state.session, model)) {
        state.disabledUntil = 0;
        state.session = undefined;
      }
    }
    while (true) {
      let state: CredentialState;
      try {
        state = selectCredential(this.states, model, this.config.routingPolicy, now, {
          excludeIds: exclude,
          maxConcurrent: this.maxConcurrent(),
        });
      } catch (error) {
        throw lastError ?? error;
      }
      markSelected(state, now);
      try {
        const live = state.session;
        if (live?.status === "active" && live.model === model && live.instanceId) {
          const refreshed = await this.sessions.call("GET", state.account.authToken, {
            instanceId: live.instanceId,
            heartbeat: true,
            compact: true,
          });
          state.session = refreshed;
          if (refreshed.status === "active" && refreshed.model === model && refreshed.instanceId) {
            return state;
          }
          markQuotaFailure(state, refreshed, now, this.config.cooldownMs);
          exclude.add(state.account.id);
          markReleased(state);
          continue;
        }
        const admitted = await this.sessions.call("POST", state.account.authToken, { model });
        state.session = admitted;
        if (admitted.status === "active" && admitted.instanceId) return state;
        markQuotaFailure(state, admitted, now, this.config.cooldownMs);
        exclude.add(state.account.id);
        markReleased(state);
        continue;
      } catch (error) {
        markReleased(state);
        if (!(error instanceof UpstreamError)) throw error;
        lastError = error;
        state.disabledUntil = now + this.config.cooldownMs;
        exclude.add(state.account.id);
      }
    }
  }

  public release(state: CredentialState): void {
    markReleased(state);
  }

  public cooldown(state: CredentialState, now = Date.now()): void {
    state.session = undefined;
    state.disabledUntil = now + this.config.cooldownMs;
  }
}

export function fetchSessionTransport(
  timeoutMs: number,
  maxResponseBytes = 1_048_576,
): SessionTransport {
  return {
    async request({ method, url, headers }) {
      let response: Response;
      try {
        response = await fetch(url, {
          method,
          headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Freebuff session network failure";
        throw new UpstreamError(message, 503);
      }
      const text = await readBoundedText(response, maxResponseBytes);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = {};
      }
      return { status: response.status, json };
    },
  };
}

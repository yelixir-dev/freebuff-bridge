import { accountsFromTokens, loadCredentialsFile } from "./credentials.js";
import { remainingSessions, quotaForModel, sessionEndsAdmission } from "./quota.js";
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
  const fromFile = loadCredentialsFile(config.credentialsPath);
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
        quota,
        remaining: remainingSessions(quota),
        disabledUntil: state.disabledUntil || null,
      };
    });
  }

  public async refreshAll(): Promise<void> {
    await Promise.all(
      this.states.map(async (state) => {
        const instanceId = state.session?.instanceId;
        state.session = await this.sessions.call("GET", state.account.authToken, {
          ...(instanceId ? { instanceId } : {}),
          compact: false,
        });
      }),
    );
  }

  public async admit(model: string, now = Date.now()): Promise<CredentialState> {
    const exclude = new Set<string>();
    while (true) {
      const state = selectCredential(this.states, model, this.config.routingPolicy, now, {
        excludeIds: exclude,
        maxConcurrent: this.maxConcurrent(),
      });
      markSelected(state, now);
      try {
        const live = state.session;
        if (live?.status === "active" && live.model === model && live.instanceId) return state;
        const admitted = await this.sessions.call("POST", state.account.authToken, { model });
        state.session = admitted;
        if (admitted.status === "active" && admitted.instanceId) return state;
        if (sessionEndsAdmission(admitted.status)) {
          markQuotaFailure(state, admitted, now);
          exclude.add(state.account.id);
          markReleased(state);
          continue;
        }
        markReleased(state);
        throw new Error(`session ${admitted.status}`);
      } catch (error) {
        markReleased(state);
        throw error;
      }
    }
  }

  public release(state: CredentialState): void {
    markReleased(state);
  }
}

export function fetchSessionTransport(timeoutMs: number): SessionTransport {
  return {
    async request({ method, url, headers }) {
      const response = await fetch(url, {
        method,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
      const json: unknown = await response.json().catch(() => ({}));
      return { status: response.status, json };
    },
  };
}

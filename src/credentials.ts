import { readFileSync } from "node:fs";

import type { FreebuffAccount } from "./types.js";

interface RawAccount {
  readonly id?: unknown;
  readonly name?: unknown;
  readonly email?: unknown;
  readonly authToken?: unknown;
  readonly fingerprintId?: unknown;
  readonly fingerprintHash?: unknown;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseAccount(raw: RawAccount, fallbackId: string): FreebuffAccount | undefined {
  const authToken = asString(raw.authToken);
  if (!authToken) return undefined;
  const id = asString(raw.id) ?? fallbackId;
  return {
    id,
    label: asString(raw.name) ?? asString(raw.email) ?? id,
    authToken,
    fingerprintId: asString(raw.fingerprintId) ?? "",
    fingerprintHash: asString(raw.fingerprintHash) ?? "",
    enabled: true,
  };
}

export function parseCredentialsJson(text: string): FreebuffAccount[] {
  const parsed: unknown = JSON.parse(text);
  if (!parsed || typeof parsed !== "object") return [];
  const record = parsed as Record<string, unknown>;
  const accounts: FreebuffAccount[] = [];

  if (Array.isArray(record["accounts"])) {
    for (const [index, item] of record["accounts"].entries()) {
      if (!item || typeof item !== "object") continue;
      const account = parseAccount(item, `account-${index + 1}`);
      if (account) accounts.push(account);
    }
    return dedupe(accounts);
  }

  for (const [key, value] of Object.entries(record)) {
    if (!value || typeof value !== "object") continue;
    const account = parseAccount(value, key);
    if (account) accounts.push(account);
  }
  return dedupe(accounts);
}

function dedupe(accounts: readonly FreebuffAccount[]): FreebuffAccount[] {
  const seen = new Set<string>();
  const out: FreebuffAccount[] = [];
  for (const account of accounts) {
    if (seen.has(account.authToken)) continue;
    seen.add(account.authToken);
    out.push(account);
  }
  return out;
}

export function loadCredentialsFile(path: string): FreebuffAccount[] {
  try {
    return parseCredentialsJson(readFileSync(path, "utf8"));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return [];
    throw error;
  }
}

export function accountsFromTokens(tokens: readonly string[]): FreebuffAccount[] {
  return tokens
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token, index) => ({
      id: `token-${index + 1}`,
      label: `token-${index + 1}`,
      authToken: token,
      fingerprintId: "",
      fingerprintHash: "",
      enabled: true,
    }));
}

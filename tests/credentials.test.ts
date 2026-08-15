import { describe, expect, it } from "vitest";

import { accountsFromTokens, parseCredentialsJson } from "../src/credentials.js";

describe("parseCredentialsJson", () => {
  it("reads the official default account object", () => {
    const accounts = parseCredentialsJson(
      JSON.stringify({
        default: {
          id: "user-1",
          name: "Ada",
          authToken: "tok-a",
          fingerprintId: "enhanced-abc",
          fingerprintHash: "hash",
        },
      }),
    );
    expect(accounts).toEqual([
      {
        id: "user-1",
        label: "Ada",
        authToken: "tok-a",
        fingerprintId: "enhanced-abc",
        fingerprintHash: "hash",
        enabled: true,
      },
    ]);
  });

  it("reads an accounts array and drops duplicate tokens", () => {
    const accounts = parseCredentialsJson(
      JSON.stringify({
        accounts: [
          { id: "a", authToken: "tok-a" },
          { id: "b", authToken: "tok-a" },
          { id: "c", authToken: "tok-c" },
        ],
      }),
    );
    expect(accounts.map((account) => account.id)).toEqual(["a", "c"]);
  });
});

describe("accountsFromTokens", () => {
  it("skips blank tokens", () => {
    expect(accountsFromTokens(["  tok-1  ", "", "tok-2"]).map((a) => a.authToken)).toEqual([
      "tok-1",
      "tok-2",
    ]);
  });
});

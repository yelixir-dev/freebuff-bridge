import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

const scriptPath = new URL("../scripts/freebuff-token.mjs", import.meta.url);

function createHome(): string {
  const home = mkdtempSync(join(tmpdir(), "freebuff-token-"));
  const configDirectory = join(home, ".config", "manicode");
  mkdirSync(configDirectory, { recursive: true });
  writeFileSync(
    join(configDirectory, "credentials.json"),
    JSON.stringify({
      default: {
        id: "account-1",
        name: "Primary",
        email: "primary@example.com",
        authToken: "secret-current-token",
      },
      archived: {
        id: "account-2",
        name: "Archived",
        email: "archived@example.com",
        authToken: "stale-token",
      },
    }),
  );
  return home;
}

describe("freebuff-token", () => {
  it("prints only the current default token when --print is used", () => {
    // Given
    const home = createHome();

    // When
    const result = spawnSync(process.execPath, [scriptPath.pathname, "--print"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });

    // Then
    expect(result.status).toBe(0);
    expect(result.stdout).toBe("secret-current-token\n");
  });

  it("copies the current default token when no option is used", () => {
    // Given
    const home = createHome();
    const binDirectory = join(home, "bin");
    const copiedTokenPath = join(home, "copied-token");
    const clipboardCommand = join(binDirectory, "pbcopy");
    mkdirSync(binDirectory);
    writeFileSync(clipboardCommand, '#!/bin/sh\ncat > "$COPY_OUTPUT"\n');
    chmodSync(clipboardCommand, 0o755);

    // When
    const result = spawnSync(process.execPath, [scriptPath.pathname], {
      encoding: "utf8",
      env: {
        ...process.env,
        COPY_OUTPUT: copiedTokenPath,
        HOME: home,
        PATH: `${binDirectory}:${process.env["PATH"] ?? ""}`,
      },
    });

    // Then
    expect(result.status).toBe(0);
    expect(readFileSync(copiedTokenPath, "utf8")).toBe("secret-current-token");
    expect(result.stdout).not.toContain("secret-current-token");
  });

  it("fails without exposing data when the current login is missing", () => {
    // Given
    const home = mkdtempSync(join(tmpdir(), "freebuff-token-empty-"));

    // When
    const result = spawnSync(process.execPath, [scriptPath.pathname, "--print"], {
      encoding: "utf8",
      env: { ...process.env, HOME: home },
    });

    // Then
    expect(result.status).not.toBe(0);
    expect(result.stdout).toBe("");
  });
});

#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";

import { z } from "zod";

const accountSchema = z.object({
  authToken: z.string().trim().min(1),
  name: z.string().trim().min(1).optional(),
  email: z.email().optional(),
});
const credentialsSchema = z.record(z.string(), accountSchema);

function main() {
  const arguments_ = new Set(process.argv.slice(2));
  const supportedArguments = new Set(["--help", "--print"]);
  const unknownArgument = [...arguments_].find((value) => !supportedArguments.has(value));
  if (unknownArgument) throw new Error(`Unknown option: ${unknownArgument}`);

  if (arguments_.has("--help")) {
    process.stdout.write(`Usage: freebuff-token [--print]

Without options, copies the current Freebuff CLI auth token to the clipboard.
Use --print to write only the token to stdout.
`);
    return;
  }

  const credentialsPath =
    process.env["FREEBUFF_CLI_CREDENTIALS_PATH"] ??
    join(homedir(), ".config", "manicode", "credentials.json");
  const credentials = credentialsSchema.parse(JSON.parse(readFileSync(credentialsPath, "utf8")));
  const account = credentials["default"];
  if (!account) throw new Error("Freebuff CLI has no current default login");

  if (arguments_.has("--print")) {
    process.stdout.write(`${account.authToken}\n`);
    return;
  }

  const commands =
    process.platform === "darwin"
      ? [["pbcopy"]]
      : process.platform === "win32"
        ? [["clip"]]
        : [["wl-copy"], ["xclip", "-selection", "clipboard"], ["xsel", "--clipboard", "--input"]];
  const copied = commands.some(([command, ...args]) => {
    if (!command) return false;
    const result = spawnSync(command, args, {
      encoding: "utf8",
      input: account.authToken,
    });
    return result.status === 0;
  });
  if (!copied) throw new Error("No supported clipboard command is available; use --print");

  const label = account.name ?? account.email ?? "current account";
  process.stdout.write(`Copied the Freebuff token for ${label}.\n`);
}

try {
  main();
} catch (error) {
  // no-excuse-ok: catch — CLI process boundary
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`freebuff-token: ${message}\n`);
  process.exitCode = 1;
}

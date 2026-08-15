import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { z } from "zod";

import { ROUTING_POLICIES, type FreebuffAccount } from "./types.js";

const storedCredentialSchema = z
  .object({
    id: z.string().trim().min(1),
    name: z.string().trim().min(1).optional(),
    label: z.string().trim().min(1).optional(),
    authToken: z.string().trim().min(1),
    fingerprintId: z.string().default(""),
    fingerprintHash: z.string().default(""),
    enabled: z.boolean().default(true),
  })
  .transform((value) => ({
    id: value.id,
    label: value.name ?? value.label ?? value.id,
    authToken: value.authToken,
    fingerprintId: value.fingerprintId,
    fingerprintHash: value.fingerprintHash,
    enabled: value.enabled,
  }));

const dashboardConfigFileSchema = z.object({
  bridgeApiKey: z.string().trim().optional(),
  server: z
    .object({
      host: z.string().trim().min(1),
      port: z.number().int().min(0).max(65_535),
    })
    .optional(),
  routing: z
    .object({
      policy: z.enum(ROUTING_POLICIES),
      maxConcurrent: z.number().int().min(0),
    })
    .optional(),
  models: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  credentials: z.array(storedCredentialSchema).optional(),
});

export type DashboardConfigFile = z.infer<typeof dashboardConfigFileSchema>;

export interface DashboardConfigWrite {
  readonly bridgeApiKey: string;
  readonly server: {
    readonly host: string;
    readonly port: number;
  };
  readonly routing: {
    readonly policy: (typeof ROUTING_POLICIES)[number];
    readonly maxConcurrent: number;
  };
  readonly models: readonly {
    readonly id: string;
    readonly enabled: boolean;
  }[];
  readonly credentials: readonly FreebuffAccount[];
}

export function defaultDashboardConfigPath(): string {
  return join(homedir(), ".config", "freebuff-bridge", "config.json");
}

export function readDashboardConfigFile(path: string): DashboardConfigFile | undefined {
  if (!existsSync(path)) return undefined;
  return dashboardConfigFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
}

export function writeDashboardConfigFile(path: string, update: DashboardConfigWrite): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  const content = {
    ...(update.bridgeApiKey ? { bridgeApiKey: update.bridgeApiKey } : {}),
    server: update.server,
    routing: update.routing,
    models: update.models,
    credentials: update.credentials.map((account) => ({
      id: account.id,
      name: account.label,
      authToken: account.authToken,
      fingerprintId: account.fingerprintId,
      fingerprintHash: account.fingerprintHash,
      enabled: account.enabled,
    })),
  };
  try {
    writeFileSync(temporaryPath, `${JSON.stringify(content, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600,
    });
    renameSync(temporaryPath, path);
    chmodSync(path, 0o600);
  } finally {
    if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
  }
}

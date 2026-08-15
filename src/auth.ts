import { timingSafeEqual } from "node:crypto";

import { AuthError } from "./errors.js";

export function keysEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function readBearer(authorization: string | undefined): string {
  if (!authorization) return "";
  const match = /^Bearer\s+(.+)$/i.exec(authorization.trim());
  return match?.[1]?.trim() ?? "";
}

export function assertBridgeAuth(
  configuredKey: string,
  authorization: string | undefined,
  apiKeyHeader: string | undefined,
): void {
  if (!configuredKey) return;
  const presented = readBearer(authorization) || apiKeyHeader?.trim() || "";
  if (!presented || !keysEqual(presented, configuredKey)) {
    throw new AuthError();
  }
}

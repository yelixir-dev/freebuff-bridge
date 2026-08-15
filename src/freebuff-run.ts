import { z } from "zod";

import { UpstreamError } from "./errors.js";
import { CHAT_USER_AGENT } from "./identity.js";

const userSchema = z.object({ id: z.string().min(1) });
const runSchema = z.object({ runId: z.string().min(1) });

export interface FreebuffRun {
  readonly runId: string;
  readonly actingUserId?: string;
}

interface RunInput {
  readonly apiBase: string;
  readonly token: string;
  readonly timeoutMs: number;
}

function runHeaders(token: string, actingUserId?: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    "user-agent": CHAT_USER_AGENT,
    "content-type": "application/json",
    ...(actingUserId ? { "x-freebuff-acting-user-id": actingUserId } : {}),
  };
}

async function responseJson(response: Response): Promise<unknown> {
  return response.json().catch(() => undefined);
}

export async function startFreebuffRun(
  input: RunInput & { readonly agentId: string },
): Promise<FreebuffRun> {
  const root = input.apiBase.replace(/\/$/, "");
  const userResponse = await fetch(`${root}/api/v1/me?fields=id`, {
    headers: { Authorization: `Bearer ${input.token}` },
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const user = userResponse.ok ? userSchema.safeParse(await responseJson(userResponse)) : undefined;
  const actingUserId = user?.success ? user.data.id : undefined;
  const response = await fetch(`${root}/api/v1/agent-runs`, {
    method: "POST",
    headers: runHeaders(input.token, actingUserId),
    body: JSON.stringify({ action: "START", agentId: input.agentId }),
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const parsed = runSchema.safeParse(await responseJson(response));
  if (!response.ok || !parsed.success) {
    throw new UpstreamError(`Freebuff run start failed: ${response.status}`, response.status);
  }
  return { runId: parsed.data.runId, ...(actingUserId ? { actingUserId } : {}) };
}

export async function finishFreebuffRun(input: RunInput & FreebuffRun): Promise<void> {
  try {
    await fetch(`${input.apiBase.replace(/\/$/, "")}/api/v1/agent-runs`, {
      method: "POST",
      headers: runHeaders(input.token, input.actingUserId),
      body: JSON.stringify({
        action: "FINISH",
        runId: input.runId,
        status: "completed",
        totalSteps: 0,
        directCredits: 0,
        totalCredits: 0,
      }),
      signal: AbortSignal.timeout(input.timeoutMs),
    });
  } catch {
    // no-excuse-ok: catch — run finalization is best-effort after the model response
  }
}

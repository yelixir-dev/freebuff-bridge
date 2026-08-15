import { afterEach, describe, expect, it, vi } from "vitest";

import { finishFreebuffRun, startFreebuffRun } from "../src/freebuff-run.js";

describe("Freebuff agent-run lifecycle", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("resolves the acting user and starts a CLI-authenticated run", async () => {
    const requests: Array<{ url: string; init: RequestInit | undefined }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        requests.push({ url, init });
        return requests.length === 1
          ? Response.json({ id: "user-1" })
          : Response.json({ runId: "run-1" });
      }),
    );

    const run = await startFreebuffRun({
      apiBase: "https://example.test",
      token: "token",
      agentId: "base2-free-deepseek-flash",
      timeoutMs: 1_000,
    });

    expect(run).toEqual({ runId: "run-1", actingUserId: "user-1" });
    expect(requests[0]?.url).toBe("https://example.test/api/v1/me?fields=id");
    expect(requests[1]?.init?.headers).toMatchObject({
      Authorization: "Bearer token",
      "user-agent": "ai-sdk/openai-compatible/0.0.0-test/codebuff",
      "x-freebuff-acting-user-id": "user-1",
    });
    expect(JSON.parse(String(requests[1]?.init?.body))).toEqual({
      action: "START",
      agentId: "base2-free-deepseek-flash",
    });
  });

  it("finishes the run with zero-credit accounting", async () => {
    let requestInit: RequestInit | undefined;
    const request = vi.fn(async (_url: string, init?: RequestInit) => {
      requestInit = init;
      return Response.json({ ok: true });
    });
    vi.stubGlobal("fetch", request);

    await finishFreebuffRun({
      apiBase: "https://example.test",
      token: "token",
      runId: "run-1",
      actingUserId: "user-1",
      timeoutMs: 1_000,
    });

    expect(JSON.parse(String(requestInit?.body))).toEqual({
      action: "FINISH",
      runId: "run-1",
      status: "completed",
      totalSteps: 0,
      directCredits: 0,
      totalCredits: 0,
    });
  });
});

import { describe, expect, it } from "vitest";

import {
  CHAT_USER_AGENT,
  chatMetadata,
  ensureFreeMarker,
  officialChatHeaders,
  officialSessionHeaders,
  stripSampling,
} from "../src/identity.js";

describe("official identity", () => {
  it("uses the official SDK chat user-agent, not Freebuff-CLI", () => {
    const headers = officialChatHeaders({
      token: "tok",
      model: "deepseek/deepseek-v4-flash",
      actingUserId: "user-1",
    });
    expect(headers["user-agent"]).toBe(CHAT_USER_AGENT);
    expect(headers["user-agent"].startsWith("Freebuff-CLI")).toBe(false);
    expect(headers.Authorization).toBe("Bearer tok");
    expect(headers["x-freebuff-instance-id"]).toBeUndefined();
    expect(headers["x-freebuff-acting-user-id"]).toBe("user-1");
    expect(headers["user-agent"]).toBe("ai-sdk/openai-compatible/0.0.0-test/codebuff");
  });

  it("sends heartbeat only on GET session polls", () => {
    const headers = officialSessionHeaders({
      token: "tok",
      method: "GET",
      instanceId: "inst-1",
      heartbeat: true,
      compact: true,
    });
    expect(headers["x-freebuff-heartbeat"]).toBe("1");
    expect(headers["x-freebuff-compact-session"]).toBe("1");
  });

  it("pins cost_mode free on chat metadata", () => {
    expect(
      chatMetadata({
        runId: "run",
        clientId: "cli",
        agentId: "base2-free-deepseek-flash",
        instanceId: "inst-1",
      }).codebuff_metadata,
    ).toEqual({
      run_id: "run",
      client_id: "cli",
      n: "base2-free-deepseek-flash",
      cost_mode: "free",
      freebuff_instance_id: "inst-1",
    });
  });

  it("injects the required Freebuff root marker into the first system message", () => {
    const messages = ensureFreeMarker([{ role: "user", content: "hi" }]);

    expect(messages[0]).toMatchObject({ role: "system" });
    expect(messages[0]?.content).toMatch(/^You are Buffy, the strategic coding assistant\./);
    expect(ensureFreeMarker(messages)).toEqual(messages);
  });

  it("strips sampling and tools so the request looks like a helper agent", () => {
    const stripped = stripSampling({
      model: "deepseek/deepseek-v4-flash",
      messages: [{ role: "user" as const, content: "hi" }],
      temperature: 0.2,
      top_p: 0.9,
      max_tokens: 64,
      tools: [{ type: "function" }],
    });
    expect(stripped).toEqual({
      model: "deepseek/deepseek-v4-flash",
      messages: [{ role: "user", content: "hi" }],
    });
  });
});

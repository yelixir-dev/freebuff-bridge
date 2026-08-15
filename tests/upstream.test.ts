import { describe, expect, it } from "vitest";

import { forwardChat } from "../src/upstream.js";

const input = {
  apiBase: "https://example.test",
  token: "token",
  instanceId: "instance",
  clientId: "client",
  run: {
    runId: "run-1",
    actingUserId: "user-1",
    agentId: "base2-free-deepseek-flash",
  },
  request: {
    model: "deepseek/deepseek-v4-flash",
    messages: [{ role: "user" as const, content: "hi" }],
  },
};

describe("forwardChat response validation", () => {
  it("sends the accepted CLI marker, metadata, and acting-user header", async () => {
    let request: Parameters<NonNullable<Parameters<typeof forwardChat>[0]["transport"]["chat"]>>[0];
    await forwardChat({
      ...input,
      transport: {
        chat: async (value) => {
          request = value;
          return {
            status: 200,
            json: {
              choices: [{ message: { role: "assistant", content: "ok" } }],
            },
          };
        },
      },
    });

    expect(request!.headers).toMatchObject({
      "user-agent": "ai-sdk/openai-compatible/0.0.0-test/codebuff",
      "x-freebuff-acting-user-id": "user-1",
    });
    expect(request!.body).toMatchObject({
      messages: [
        {
          role: "system",
          content: expect.stringMatching(/^You are Buffy, the strategic coding assistant\./),
        },
        { role: "user", content: "hi" },
      ],
      codebuff_metadata: {
        run_id: "run-1",
        client_id: "client",
        n: "base2-free-deepseek-flash",
        cost_mode: "free",
        freebuff_instance_id: "instance",
      },
    });
  });

  it("accepts a tool-call-only completion as visible output", async () => {
    const response = await forwardChat({
      ...input,
      transport: {
        chat: async () => ({
          status: 200,
          json: {
            choices: [
              {
                finish_reason: "tool_calls",
                message: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      id: "call-1",
                      type: "function",
                      function: { name: "Bash", arguments: "{}" },
                    },
                  ],
                },
              },
            ],
          },
        }),
      },
    });

    expect(response.status).toBe(200);
  });

  it("rejects a malformed successful completion", async () => {
    await expect(
      forwardChat({
        ...input,
        transport: {
          chat: async () => ({ status: 200, json: { object: "chat.completion" } }),
        },
      }),
    ).rejects.toMatchObject({ code: "freebuff_invalid_response" });
  });

  it("rejects a 200 application error envelope", async () => {
    await expect(
      forwardChat({
        ...input,
        transport: {
          chat: async () => ({
            status: 200,
            json: { error: { message: "upstream failed" } },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "upstream_error" });
  });

  it.each([
    {
      message: { role: "assistant", content: "   " },
      name: "whitespace-only content",
    },
    {
      message: { role: "assistant", content: null, tool_calls: [{}] },
      name: "malformed tool calls",
    },
  ])("rejects $name", async ({ message }) => {
    await expect(
      forwardChat({
        ...input,
        transport: {
          chat: async () => ({
            status: 200,
            json: { choices: [{ finish_reason: "stop", message }] },
          }),
        },
      }),
    ).rejects.toMatchObject({ code: "freebuff_empty_visible_response" });
  });
});

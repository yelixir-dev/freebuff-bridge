import { PassThrough } from "node:stream";

import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import { runtimeWithSession, testConfig } from "./fixtures.js";

const payload = {
  model: "deepseek/deepseek-v4-flash",
  messages: [{ role: "user", content: "hi" }],
};

describe("chat route", () => {
  it("preserves tool history while removing disabled request controls", async () => {
    const config = testConfig();
    const methods: string[] = [];
    let forwarded: unknown;
    const app = await createApp({
      config,
      runtime: runtimeWithSession(config, async (method) => {
        methods.push(method);
        return {
          status: "active",
          instanceId: "inst-1",
          model: "deepseek/deepseek-v4-flash",
        };
      }),
      upstream: {
        chat: async ({ body }) => {
          forwarded = body;
          return {
            status: 200,
            json: {
              id: "cmp",
              choices: [{ message: { role: "assistant", content: "hi" } }],
            },
          };
        },
      },
    });
    const messages = [
      { role: "user", content: "run the tool" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "Bash", arguments: '{"command":"pwd"}' },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", name: "Bash", content: "/tmp" },
      { role: "user", content: "summarize" },
    ];
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        model: payload.model,
        messages,
        temperature: 0.4,
        tools: [{ type: "function", function: { name: "Bash" } }],
        tool_choice: "none",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(methods).toContain("POST");
    expect(forwarded).toMatchObject({
      messages: [
        {
          role: "system",
          content: expect.stringMatching(/^You are Buffy, the strategic coding assistant\./),
        },
        ...messages,
      ],
      codebuff_metadata: { cost_mode: "free" },
    });
    expect(forwarded).not.toHaveProperty("temperature");
    expect(forwarded).not.toHaveProperty("tools");
    expect(forwarded).not.toHaveProperty("tool_choice");
    await app.close();
  });

  it("fails closed on an empty completion without tool calls", async () => {
    const config = testConfig();
    const app = await createApp({
      config,
      runtime: runtimeWithSession(config),
      upstream: {
        chat: async () => ({
          status: 200,
          json: {
            choices: [{ message: { role: "assistant", content: "" }, finish_reason: "length" }],
          },
        }),
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload,
    });
    expect(response.statusCode).toBe(502);
    expect(response.json().error.code).toBe("freebuff_empty_visible_response");
    await app.close();
  });

  it("delivers the first SSE event before the upstream stream ends", async () => {
    const config = testConfig();
    const runtime = runtimeWithSession(config);
    const stream = new PassThrough();
    let signalUpstream: (() => void) | undefined;
    const upstreamCalled = new Promise<void>((resolve) => {
      signalUpstream = resolve;
    });
    const app = await createApp({
      config,
      runtime,
      upstream: {
        chat: async () => {
          signalUpstream?.();
          return { status: 200, stream };
        },
      },
    });
    const address = await app.listen({ host: "127.0.0.1", port: 0 });
    const responsePromise = fetch(`${address}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, stream: true }),
    });
    await upstreamCalled;
    stream.write('data: {"choices":[{"delta":{"content":"a"}}]}\n\n');
    const response = await responsePromise;
    if (!response.body) throw new Error("missing response stream");
    const reader = response.body.getReader();
    const first = await reader.read();

    expect(response.status).toBe(200);
    expect(new TextDecoder().decode(first.value)).toContain('"content":"a"');
    expect(runtime.states[0]?.inFlight).toBe(1);
    stream.end("data: [DONE]\n\n");
    let tail = "";
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      tail += new TextDecoder().decode(chunk.value);
    }
    expect(tail).toContain("data: [DONE]");
    expect(runtime.states[0]?.inFlight).toBe(0);
    await app.close();
  });

  it("preserves retryable upstream status as an OpenAI error", async () => {
    const config = testConfig();
    const app = await createApp({
      config,
      runtime: runtimeWithSession(config),
      upstream: {
        chat: async () => ({
          status: 429,
          json: { error: { message: "rate limited" } },
        }),
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload,
    });
    expect(response.statusCode).toBe(429);
    expect(response.json().error.code).toBe("upstream_error");
    await app.close();
  });
});

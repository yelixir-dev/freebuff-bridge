import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import { runtimeWithSession, testConfig } from "./fixtures.js";

const payload = {
  model: "deepseek/deepseek-v4-flash",
  messages: [{ role: "user", content: "hi" }],
};

describe("tool bridge route", () => {
  it("adapts active tools to Freebuff XML and returns canonical parallel calls", async () => {
    const config = testConfig();
    let forwarded: unknown;
    const app = await createApp({
      config,
      runtime: runtimeWithSession(config),
      upstream: {
        chat: async ({ body }) => {
          forwarded = body;
          return {
            status: 200,
            json: {
              id: "cmp-tools",
              model: payload.model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content:
                      '<codebuff_tool_call>{"cb_tool_name":"lookup","key":"alpha"}</codebuff_tool_call>' +
                      '<codebuff_tool_call>{"cb_tool_name":"lookup","key":"beta"}</codebuff_tool_call>',
                  },
                  finish_reason: "stop",
                },
              ],
            },
          };
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        ...payload,
        tools: [
          {
            type: "function",
            function: {
              name: "lookup",
              description: "Look up a key",
              parameters: {
                type: "object",
                properties: { key: { type: "string" } },
                required: ["key"],
              },
            },
          },
        ],
        tool_choice: "required",
        parallel_tool_calls: true,
      },
    });

    const completion = response.json();
    const calls = completion.choices[0].message.tool_calls;
    expect(response.statusCode).toBe(200);
    expect(calls).toHaveLength(2);
    expect(calls.map((call: { id: string }) => call.id)).toHaveLength(
      new Set(calls.map((call: { id: string }) => call.id)).size,
    );
    expect(
      calls.map((call: { function: { name: string; arguments: string } }) => ({
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments),
      })),
    ).toEqual([
      { name: "lookup", arguments: { key: "alpha" } },
      { name: "lookup", arguments: { key: "beta" } },
    ]);
    expect(completion.choices[0]).toMatchObject({
      finish_reason: "tool_calls",
      message: { role: "assistant", content: null },
    });
    expect(forwarded).not.toHaveProperty("tools");
    expect(forwarded).not.toHaveProperty("tool_choice");
    expect(forwarded).not.toHaveProperty("parallel_tool_calls");
    expect(forwarded).toMatchObject({
      messages: [
        {
          role: "system",
          content: expect.stringContaining('"name":"lookup"'),
        },
        ...payload.messages,
      ],
    });
    await app.close();
  });

  it("synthesizes indexed SSE tool-call deltas from nonstream upstream output", async () => {
    const config = testConfig();
    let upstreamStream: boolean | undefined;
    let forwarded: unknown;
    const app = await createApp({
      config,
      runtime: runtimeWithSession(config),
      upstream: {
        chat: async ({ body, stream }) => {
          forwarded = body;
          upstreamStream = stream;
          return {
            status: 200,
            json: {
              id: "cmp-stream-tools",
              model: payload.model,
              choices: [
                {
                  index: 0,
                  message: {
                    role: "assistant",
                    content:
                      '<codebuff_tool_call>{"cb_tool_name":"echo","text":"alpha"}</codebuff_tool_call>' +
                      '<codebuff_tool_call>{"cb_tool_name":"echo","text":"quote=\\";slash=\\\\;snow=雪"}</codebuff_tool_call>',
                  },
                  finish_reason: "stop",
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
            },
          };
        },
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: {
        ...payload,
        stream: true,
        stream_options: { include_usage: true },
        tools: [
          {
            type: "function",
            function: {
              name: "echo",
              parameters: {
                type: "object",
                properties: { text: { type: "string" } },
                required: ["text"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "echo" } },
        parallel_tool_calls: true,
      },
    });

    const events = response.body
      .split(/\n\n/)
      .filter((event) => event.startsWith("data: ") && event !== "data: [DONE]")
      .map((event) => JSON.parse(event.slice(6)));
    const callDeltas = events
      .flatMap((event) => event.choices)
      .flatMap((choice) => choice.delta?.tool_calls ?? []);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/event-stream");
    expect(upstreamStream).toBe(false);
    expect(forwarded).not.toHaveProperty("stream_options");
    expect(callDeltas.map((call) => call.index)).toEqual([0, 1]);
    expect(new Set(callDeltas.map((call) => call.id)).size).toBe(2);
    expect(
      callDeltas.map((call) => ({
        name: call.function.name,
        arguments: JSON.parse(call.function.arguments),
      })),
    ).toEqual([
      { name: "echo", arguments: { text: "alpha" } },
      { name: "echo", arguments: { text: 'quote=";slash=\\;snow=雪' } },
    ]);
    expect(events.some((event) => event.usage?.total_tokens === 15)).toBe(true);
    expect(response.body.match(/data: \[DONE\]/g)).toHaveLength(1);
    await app.close();
  });
});

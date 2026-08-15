import { describe, expect, it } from "vitest";

import { createApp } from "../src/server.js";
import { runtimeWithSession, testConfig } from "./fixtures.js";

const model = "deepseek/deepseek-v4-flash";

async function malformedHistory(messages: readonly unknown[]): Promise<number> {
  const app = await createApp({ config: testConfig() });
  const response = await app.inject({
    method: "POST",
    url: "/v1/chat/completions",
    payload: { model, messages },
  });
  await app.close();
  return response.statusCode;
}

describe("tool history validation", () => {
  it.each([
    {
      name: "missing assistant call id",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
          ],
        },
      ],
    },
    {
      name: "missing result call id",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
          ],
        },
        { role: "tool", name: "lookup", content: '{"value":1}' },
      ],
    },
    {
      name: "unknown result call id",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-other",
          name: "lookup",
          content: '{"value":1}',
        },
      ],
    },
    {
      name: "duplicate assistant call id",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"beta"}' },
            },
          ],
        },
      ],
    },
    {
      name: "mismatched result function name",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
          ],
        },
        {
          role: "tool",
          tool_call_id: "call-1",
          name: "different",
          content: '{"value":1}',
        },
      ],
    },
    {
      name: "unresolved assistant call",
      messages: [
        { role: "user", content: "call" },
        {
          role: "assistant",
          content: null,
          tool_calls: [
            {
              id: "call-1",
              type: "function",
              function: { name: "lookup", arguments: '{"key":"alpha"}' },
            },
          ],
        },
        { role: "user", content: "continue without a result" },
      ],
    },
  ])("rejects $name", async ({ messages }) => {
    expect(await malformedHistory(messages)).toBe(400);
  });

  it("preserves complete parallel calls and matching results", async () => {
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
              choices: [{ message: { role: "assistant", content: "done" } }],
            },
          };
        },
      },
    });
    const messages = [
      { role: "user", content: "lookup both" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call-alpha",
            type: "function",
            function: { name: "lookup", arguments: '{"key":"alpha"}' },
          },
          {
            id: "call-beta",
            type: "function",
            function: { name: "lookup", arguments: '{"key":"beta"}' },
          },
        ],
      },
      {
        role: "tool",
        tool_call_id: "call-alpha",
        name: "lookup",
        content: '{"value":1}',
      },
      {
        role: "tool",
        tool_call_id: "call-beta",
        name: "lookup",
        content: '{"value":2}',
      },
      { role: "user", content: "finish" },
    ];
    const response = await app.inject({
      method: "POST",
      url: "/v1/chat/completions",
      payload: { model, messages },
    });

    expect(response.statusCode).toBe(200);
    expect(forwarded).toMatchObject({
      messages: [expect.anything(), ...messages],
    });
    await app.close();
  });
});

import { describe, expect, it } from "vitest";

import { EmptyVisibleResponseError } from "../src/errors.js";
import { normalizeToolCompletion, planToolBridge } from "../src/tool-bridge.js";
import type { OpenAIChatCompletionRequest } from "../src/types.js";

function request(overrides: Partial<OpenAIChatCompletionRequest>): OpenAIChatCompletionRequest {
  return {
    model: "deepseek/deepseek-v4-flash",
    messages: [{ role: "user", content: "use a tool" }],
    ...overrides,
  };
}

const lookup = {
  type: "function" as const,
  function: {
    name: "lookup",
    description: "Look up a key",
    parameters: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
  },
};

describe("tool bridge", () => {
  it("rejects required selection without an available tool", () => {
    expect(() => planToolBridge(request({ tool_choice: "required" }))).toThrowError(
      /requires at least one defined tool/i,
    );
  });

  it("rejects duplicate function definitions", () => {
    expect(() => planToolBridge(request({ tools: [lookup, lookup] }))).toThrowError(
      /duplicate tool definition/i,
    );
  });

  it("rejects a forced function that is not defined", () => {
    expect(() =>
      planToolBridge(
        request({
          tools: [lookup],
          tool_choice: { type: "function", function: { name: "missing" } },
        }),
      ),
    ).toThrowError(/requested tool is not defined/i);
  });

  it("retries required calls that use an unlisted function", () => {
    const plan = planToolBridge(request({ tools: [lookup], tool_choice: "required" }));
    const completion = {
      choices: [
        {
          message: {
            role: "assistant",
            content:
              '<codebuff_tool_call>{"cb_tool_name":"invented","key":"alpha"}</codebuff_tool_call>',
          },
          finish_reason: "stop",
        },
      ],
    };

    expect(() => normalizeToolCompletion(completion, plan)).toThrow(EmptyVisibleResponseError);
  });

  it("normalizes DeepSeek DSML continuation calls", () => {
    const multiply = {
      type: "function" as const,
      function: {
        name: "multiply",
        parameters: {
          type: "object",
          properties: {
            seed: { type: "integer" },
            factor: { type: "integer" },
          },
          required: ["seed", "factor"],
        },
      },
    };
    const plan = planToolBridge(request({ tools: [multiply], tool_choice: "required" }));
    const completion = {
      choices: [
        {
          message: {
            role: "assistant",
            content:
              '<｜｜DSML｜｜tool_calls>\n<｜｜DSML｜｜invoke name="multiply">\n' +
              '<｜｜DSML｜｜parameter name="seed" string="true">7</｜｜DSML｜｜parameter>\n' +
              '<｜｜DSML｜｜parameter name="factor" string="true">6</｜｜DSML｜｜parameter>\n' +
              "</｜｜DSML｜｜invoke>\n</｜｜DSML｜｜tool_calls>",
          },
          finish_reason: "stop",
        },
      ],
    };

    const normalized = normalizeToolCompletion(completion, plan) as typeof completion & {
      choices: Array<{
        message: { content: string | null; tool_calls: Array<{ function: { arguments: string } }> };
        finish_reason: string;
      }>;
    };
    expect(normalized.choices[0]?.message.content).toBeNull();
    expect(normalized.choices[0]?.finish_reason).toBe("tool_calls");
    expect(
      JSON.parse(normalized.choices[0]?.message.tool_calls[0]?.function.arguments ?? ""),
    ).toEqual({ seed: 7, factor: 6 });
  });

  it("preserves ordinary text when automatic selection does not call a tool", () => {
    const plan = planToolBridge(request({ tools: [lookup], tool_choice: "auto" }));
    const completion = {
      choices: [
        {
          message: { role: "assistant", content: "No tool needed." },
          finish_reason: "stop",
        },
      ],
    };

    expect(normalizeToolCompletion(completion, plan)).toBe(completion);
  });
});

import crypto from "node:crypto";

import type { OpenAIToolCall } from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codebuffPattern(): RegExp {
  return /<codebuff_tool_call>\s*([\s\S]*?)\s*<\/codebuff_tool_call>/g;
}

function dsmlInvokePattern(): RegExp {
  return /<｜｜DSML｜｜invoke\s+name=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/｜｜DSML｜｜invoke>/g;
}

function dsmlParameterPattern(): RegExp {
  return /<｜｜DSML｜｜parameter\s+name=(?:"([^"]+)"|'([^']+)')[^>]*>([\s\S]*?)<\/｜｜DSML｜｜parameter>/g;
}

function genericToolPattern(): RegExp {
  return /<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g;
}

function genericFunctionPattern(): RegExp {
  return /<function=([A-Za-z0-9_.-]+)\s*>([\s\S]*?)<\/function>/g;
}

function genericParameterPattern(): RegExp {
  return /<parameter=([A-Za-z_][A-Za-z0-9_-]*)\s*>([\s\S]*?)<\/parameter>/g;
}

function parseRecord(value: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function parseParameter(value: string): unknown {
  const decoded = decodeXml(value.trim());
  try {
    return JSON.parse(decoded);
  } catch {
    return decoded;
  }
}

function toolCall(name: string, input: Readonly<Record<string, unknown>>): OpenAIToolCall {
  return {
    id: `call_${crypto.randomUUID().replaceAll("-", "")}`,
    type: "function",
    function: { name, arguments: JSON.stringify(input) },
  };
}

function codebuffCalls(
  content: string,
  allowedNames: ReadonlySet<string>,
): readonly OpenAIToolCall[] {
  const calls: OpenAIToolCall[] = [];
  for (const match of content.matchAll(codebuffPattern())) {
    const parsed = parseRecord(match[1] ?? "");
    if (!parsed || typeof parsed.cb_tool_name !== "string") continue;
    const name = parsed.cb_tool_name;
    if (!allowedNames.has(name)) continue;
    const input = { ...parsed };
    delete input.cb_tool_name;
    delete input.cb_easp;
    calls.push(toolCall(name, input));
  }
  return calls;
}

function dsmlCalls(content: string, allowedNames: ReadonlySet<string>): readonly OpenAIToolCall[] {
  const calls: OpenAIToolCall[] = [];
  for (const invoke of content.matchAll(dsmlInvokePattern())) {
    const name = decodeXml(invoke[1] ?? invoke[2] ?? "").trim();
    if (!allowedNames.has(name)) continue;
    const input: Record<string, unknown> = {};
    for (const parameter of (invoke[3] ?? "").matchAll(dsmlParameterPattern())) {
      const parameterName = decodeXml(parameter[1] ?? parameter[2] ?? "").trim();
      if (!parameterName) continue;
      input[parameterName] = parseParameter(parameter[3] ?? "");
    }
    calls.push(toolCall(name, input));
  }
  return calls;
}

function genericCalls(
  content: string,
  allowedNames: ReadonlySet<string>,
): readonly OpenAIToolCall[] {
  const calls: OpenAIToolCall[] = [];
  for (const block of content.matchAll(genericToolPattern())) {
    for (const fn of (block[1] ?? "").matchAll(genericFunctionPattern())) {
      const name = fn[1] ?? "";
      if (!allowedNames.has(name)) continue;
      const input: Record<string, unknown> = {};
      for (const parameter of (fn[2] ?? "").matchAll(genericParameterPattern())) {
        const parameterName = parameter[1] ?? "";
        input[parameterName] = parseParameter(parameter[2] ?? "");
      }
      calls.push(toolCall(name, input));
    }
  }
  return calls;
}

export function parseToolCallText(
  content: string,
  allowedNames: ReadonlySet<string>,
): { readonly calls: readonly OpenAIToolCall[]; readonly text: string } {
  const calls = [
    ...codebuffCalls(content, allowedNames),
    ...dsmlCalls(content, allowedNames),
    ...genericCalls(content, allowedNames),
  ];
  const text = content
    .replace(codebuffPattern(), "")
    .replace(/<｜｜DSML｜｜tool_calls>[\s\S]*?<\/｜｜DSML｜｜tool_calls>/g, "")
    .replace(genericToolPattern(), "")
    .trim();
  return { calls, text };
}

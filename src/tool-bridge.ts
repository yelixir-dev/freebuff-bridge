import crypto from "node:crypto";
import { Readable } from "node:stream";

import { BridgeError, EmptyVisibleResponseError, InvalidUpstreamResponseError } from "./errors.js";
import { parseToolCallText } from "./tool-call-parser.js";
import { assertValidToolHistory } from "./tool-history.js";
import type {
  OpenAIChatCompletionRequest,
  OpenAIChatMessage,
  OpenAIFunctionTool,
} from "./types.js";

const TOOL_START = "<codebuff_tool_call>";
const TOOL_END = "</codebuff_tool_call>";

export interface ToolBridgePlan {
  readonly active: boolean;
  readonly requireCall: boolean;
  readonly allowedNames: ReadonlySet<string>;
  readonly request: OpenAIChatCompletionRequest;
  readonly includeUsage: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toolInstruction(
  tools: readonly OpenAIFunctionTool[],
  request: OpenAIChatCompletionRequest,
): string {
  const choice = request.tool_choice;
  const forcedName = typeof choice === "object" ? choice.function.name : undefined;
  const selection =
    forcedName !== undefined
      ? `Call exactly the function named ${JSON.stringify(forcedName)}.`
      : choice === "required"
        ? "Call one or more available functions."
        : "Call an available function only when it is needed; otherwise answer normally.";
  const parallel =
    request.parallel_tool_calls === false
      ? "Return at most one tool-call block."
      : "For independent operations, return one complete block per call.";
  const definitions = tools.map((tool) => ({
    name: tool.function.name,
    ...(tool.function.description ? { description: tool.function.description } : {}),
    parameters: tool.function.parameters ?? { type: "object" },
    ...(tool.function.strict !== undefined ? { strict: tool.function.strict } : {}),
  }));
  return [
    "Client functions use the Codebuff XML protocol.",
    `For each call, output exactly ${TOOL_START} followed by one JSON object and ${TOOL_END}.`,
    'The JSON object must contain "cb_tool_name" and the function arguments as sibling fields.',
    "Do not wrap a tool call in Markdown and do not invent unlisted function names.",
    selection,
    parallel,
    `Available client functions: ${JSON.stringify(definitions)}`,
  ].join("\n");
}

function choiceRequiresCall(request: OpenAIChatCompletionRequest): boolean {
  return request.tool_choice === "required" || typeof request.tool_choice === "object";
}

function addToolInstruction(
  messages: readonly OpenAIChatMessage[],
  content: string,
): readonly OpenAIChatMessage[] {
  const insertionIndex = messages.findIndex(
    (message) => message.role !== "system" && message.role !== "developer",
  );
  const index = insertionIndex < 0 ? messages.length : insertionIndex;
  return [...messages.slice(0, index), { role: "system", content }, ...messages.slice(index)];
}

export function planToolBridge(request: OpenAIChatCompletionRequest): ToolBridgePlan {
  assertValidToolHistory(request.messages);
  const tools = request.tools ?? [];
  const active = tools.length > 0 && request.tool_choice !== "none";
  const allowedNames = new Set(tools.map((tool) => tool.function.name));
  if (tools.length === 0 && choiceRequiresCall(request)) {
    throw new BridgeError(
      "invalid_tool_choice",
      "Required tool selection requires at least one defined tool",
      400,
    );
  }
  if (allowedNames.size !== tools.length) {
    throw new BridgeError("invalid_tools", "Duplicate tool definition names are not allowed", 400);
  }
  if (
    typeof request.tool_choice === "object" &&
    !allowedNames.has(request.tool_choice.function.name)
  ) {
    throw new BridgeError(
      "invalid_tool_choice",
      `Requested tool is not defined: ${request.tool_choice.function.name}`,
      400,
    );
  }
  const messages = active
    ? addToolInstruction(request.messages, toolInstruction(tools, request))
    : request.messages;
  const upstreamRequest = { ...request, messages };
  if (active) {
    upstreamRequest.stream = false;
    delete upstreamRequest.stream_options;
  }
  return {
    active,
    requireCall: active && choiceRequiresCall(request),
    allowedNames,
    includeUsage: request.stream_options?.include_usage === true,
    request: upstreamRequest,
  };
}

export function normalizeToolCompletion(json: unknown, plan: ToolBridgePlan): unknown {
  if (!plan.active) return json;
  if (!isRecord(json) || !Array.isArray(json["choices"]) || json["choices"].length === 0) {
    throw new InvalidUpstreamResponseError();
  }
  const choice = json["choices"][0];
  if (!isRecord(choice) || !isRecord(choice["message"])) {
    throw new InvalidUpstreamResponseError();
  }
  const message = choice["message"];
  const content = typeof message["content"] === "string" ? message["content"] : "";
  const parsed = parseToolCallText(content, plan.allowedNames);
  if (parsed.calls.length === 0) {
    if (plan.requireCall) throw new EmptyVisibleResponseError();
    return json;
  }
  return {
    ...json,
    choices: [
      {
        ...choice,
        finish_reason: "tool_calls",
        message: {
          ...message,
          content: parsed.text.length > 0 ? parsed.text : null,
          tool_calls: parsed.calls,
        },
      },
      ...json["choices"].slice(1),
    ],
  };
}

function sseFrame(payload: unknown): string {
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function completionAsSse(json: unknown, includeUsage: boolean): Readable {
  if (!isRecord(json) || !Array.isArray(json["choices"]) || json["choices"].length === 0) {
    throw new InvalidUpstreamResponseError();
  }
  const choice = json["choices"][0];
  if (!isRecord(choice) || !isRecord(choice["message"])) {
    throw new InvalidUpstreamResponseError();
  }
  const message = choice["message"];
  const id = typeof json["id"] === "string" ? json["id"] : `chatcmpl-${crypto.randomUUID()}`;
  const model = typeof json["model"] === "string" ? json["model"] : "";
  const created =
    typeof json["created"] === "number" ? json["created"] : Math.floor(Date.now() / 1000);
  const base = { id, object: "chat.completion.chunk", created, model };
  const frames = [sseFrame({ ...base, choices: [{ index: 0, delta: { role: "assistant" } }] })];
  if (typeof message["content"] === "string" && message["content"].length > 0) {
    frames.push(
      sseFrame({
        ...base,
        choices: [{ index: 0, delta: { content: message["content"] }, finish_reason: null }],
      }),
    );
  }
  const toolCalls = Array.isArray(message["tool_calls"]) ? message["tool_calls"] : [];
  if (toolCalls.length > 0) {
    frames.push(
      sseFrame({
        ...base,
        choices: [
          {
            index: 0,
            delta: {
              tool_calls: toolCalls.map((call, index) => ({
                index,
                ...(isRecord(call) ? call : {}),
              })),
            },
            finish_reason: null,
          },
        ],
      }),
    );
  }
  frames.push(
    sseFrame({
      ...base,
      choices: [{ index: 0, delta: {}, finish_reason: choice["finish_reason"] ?? "stop" }],
    }),
  );
  if (includeUsage && isRecord(json["usage"])) {
    frames.push(sseFrame({ ...base, choices: [], usage: json["usage"] }));
  }
  frames.push("data: [DONE]\n\n");
  return Readable.from([frames.join("")]);
}

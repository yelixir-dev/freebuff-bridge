import type { Readable } from "node:stream";

import {
  EmptyVisibleResponseError,
  InvalidUpstreamResponseError,
  UpstreamError,
} from "./errors.js";
import { chatMetadata, ensureFreeMarker, officialChatHeaders, stripSampling } from "./identity.js";
import type { OpenAIChatCompletionRequest } from "./types.js";

export interface UpstreamTransport {
  chat(input: {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
    readonly stream: boolean;
  }): Promise<{
    readonly status: number;
    readonly json?: unknown;
    readonly text?: string;
    readonly stream?: Readable;
  }>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isValidToolCall(value: unknown): boolean {
  if (!isRecord(value) || value["type"] !== "function") return false;
  if (typeof value["id"] !== "string" || !value["id"]) return false;
  const fn = value["function"];
  return (
    isRecord(fn) &&
    typeof fn["name"] === "string" &&
    fn["name"].length > 0 &&
    typeof fn["arguments"] === "string"
  );
}

function assertVisibleCompletion(json: unknown): void {
  if (!isRecord(json)) throw new InvalidUpstreamResponseError();
  if (isRecord(json["error"])) {
    const message =
      typeof json["error"]["message"] === "string"
        ? json["error"]["message"]
        : "Freebuff upstream returned an application error";
    throw new UpstreamError(message, 502);
  }
  if (!Array.isArray(json["choices"]) || json["choices"].length === 0) {
    throw new InvalidUpstreamResponseError();
  }
  const choice = json["choices"][0];
  if (!isRecord(choice)) throw new InvalidUpstreamResponseError();
  const message = choice["message"];
  if (!isRecord(message)) throw new InvalidUpstreamResponseError();
  const content = typeof message["content"] === "string" ? message["content"] : "";
  const toolCalls = Array.isArray(message["tool_calls"]) ? message["tool_calls"] : [];
  if (content.trim().length === 0 && !toolCalls.some(isValidToolCall)) {
    throw new EmptyVisibleResponseError();
  }
}

export async function forwardChat(input: {
  readonly transport: UpstreamTransport;
  readonly apiBase: string;
  readonly token: string;
  readonly instanceId: string;
  readonly request: OpenAIChatCompletionRequest;
  readonly clientId: string;
  readonly run: {
    readonly runId: string;
    readonly actingUserId?: string;
    readonly agentId: string;
  };
}): Promise<{
  readonly status: number;
  readonly json?: unknown;
  readonly text?: string;
  readonly stream?: Readable;
}> {
  const cleaned = stripSampling({ ...input.request });
  const body = {
    ...cleaned,
    messages: ensureFreeMarker(input.request.messages),
    stream: input.request.stream === true,
    ...chatMetadata({
      runId: input.run.runId,
      clientId: input.clientId,
      agentId: input.run.agentId,
      instanceId: input.instanceId,
    }),
  };
  const response = await input.transport.chat({
    url: `${input.apiBase.replace(/\/$/, "")}/api/v1/chat/completions`,
    headers: {
      ...officialChatHeaders({
        token: input.token,
        model: input.request.model,
        ...(input.run.actingUserId ? { actingUserId: input.run.actingUserId } : {}),
      }),
      "content-type": "application/json",
    },
    body,
    stream: input.request.stream === true,
  });
  if (response.status >= 400) {
    throw new UpstreamError(`Freebuff chat failed: ${response.status}`, response.status);
  }
  if (!input.request.stream) assertVisibleCompletion(response.json);
  return response;
}

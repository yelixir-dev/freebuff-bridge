import { randomUUID } from "node:crypto";

export function chatCompletionId(): string {
  return `chatcmpl-${randomUUID()}`;
}

export function nonStreamCompletion(input: {
  readonly id: string;
  readonly model: string;
  readonly content: string;
  readonly created?: number;
}): Record<string, unknown> {
  return {
    id: input.id,
    object: "chat.completion",
    created: input.created ?? Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: input.content },
        finish_reason: "stop",
      },
    ],
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  };
}

export function streamChunk(input: {
  readonly id: string;
  readonly model: string;
  readonly delta: string;
  readonly finish?: boolean;
}): string {
  const payload = {
    id: input.id,
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: input.model,
    choices: [
      {
        index: 0,
        delta: input.finish ? {} : { content: input.delta },
        finish_reason: input.finish ? "stop" : null,
      },
    ],
  };
  return `data: ${JSON.stringify(payload)}\n\n`;
}

export function openaiError(status: number, message: string, type = "invalid_request_error") {
  return {
    status,
    body: { error: { message, type, param: null, code: null } },
  };
}

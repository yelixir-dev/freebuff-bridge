import { randomUUID } from "node:crypto";

import { UpstreamError } from "./errors.js";
import { chatMetadata, officialChatHeaders, stripSampling } from "./identity.js";
import type { OpenAIChatCompletionRequest } from "./types.js";

export interface UpstreamTransport {
  chat(input: {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
    readonly stream: boolean;
  }): Promise<{ readonly status: number; readonly json?: unknown; readonly text?: string }>;
}

export async function forwardChat(input: {
  readonly transport: UpstreamTransport;
  readonly apiBase: string;
  readonly token: string;
  readonly instanceId: string;
  readonly request: OpenAIChatCompletionRequest;
  readonly clientId: string;
}): Promise<{ readonly status: number; readonly json?: unknown; readonly text?: string }> {
  const cleaned = stripSampling({ ...input.request });
  const body = {
    ...cleaned,
    stream: input.request.stream === true,
    ...chatMetadata({ runId: randomUUID(), clientId: input.clientId }),
  };
  const response = await input.transport.chat({
    url: `${input.apiBase.replace(/\/$/, "")}/api/v1/chat/completions`,
    headers: {
      ...officialChatHeaders({
        token: input.token,
        instanceId: input.instanceId,
        model: input.request.model,
      }),
      "content-type": "application/json",
    },
    body,
    stream: input.request.stream === true,
  });
  if (response.status >= 400) {
    throw new UpstreamError(`Freebuff chat failed: ${response.status}`, response.status);
  }
  return response;
}

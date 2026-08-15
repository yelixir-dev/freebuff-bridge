import { Readable } from "node:stream";

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { createFetchUpstreamTransport, releaseAfterStream } from "./chat-transport.js";
import {
  EmptyVisibleResponseError,
  NoAvailableCredentialError,
  UnsupportedToolsError,
  UpstreamError,
} from "./errors.js";
import { resolveModel } from "./config.js";
import type { BridgeRuntime } from "./runtime.js";
import { primeVisibleSse } from "./sse.js";
import { forwardChat, type UpstreamTransport } from "./upstream.js";
import type { BridgeConfig, CredentialState, OpenAIChatCompletionRequest } from "./types.js";

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["developer", "system", "user", "assistant", "tool"]),
        content: z
          .union([z.string(), z.array(z.record(z.string(), z.unknown())), z.null()])
          .optional(),
        name: z.string().optional(),
        tool_call_id: z.string().optional(),
        tool_calls: z
          .array(
            z.object({
              id: z.string().optional(),
              type: z.literal("function"),
              function: z.object({
                name: z.string().min(1),
                arguments: z.string(),
              }),
            }),
          )
          .optional(),
      }),
    )
    .min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  tools: z.array(z.unknown()).optional(),
  tool_choice: z.unknown().optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
});

function shouldRetry(error: unknown): boolean {
  if (error instanceof EmptyVisibleResponseError) return true;
  if (!(error instanceof UpstreamError)) return false;
  return (
    error.upstreamStatus === 401 ||
    error.upstreamStatus === 403 ||
    error.upstreamStatus === 408 ||
    error.upstreamStatus === 409 ||
    error.upstreamStatus === 429 ||
    error.upstreamStatus >= 500
  );
}

function sendStream(reply: FastifyReply, stream: Readable, release: () => void): FastifyReply {
  releaseAfterStream(stream, release);
  return reply
    .type("text/event-stream; charset=utf-8")
    .header("cache-control", "no-cache, no-transform")
    .header("connection", "keep-alive")
    .header("x-accel-buffering", "no")
    .send(stream);
}

export function registerChatRoute(
  app: FastifyInstance,
  options: {
    readonly config: BridgeConfig;
    readonly runtime: BridgeRuntime;
    readonly upstream?: UpstreamTransport;
  },
): void {
  app.post("/v1/chat/completions", async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = chatSchema.parse(request.body) as OpenAIChatCompletionRequest;
    if ((parsed.tools?.length ?? 0) > 0 && parsed.tool_choice !== "none") {
      throw new UnsupportedToolsError();
    }
    const model = resolveModel(options.config, parsed.model);
    const transport =
      options.upstream ??
      createFetchUpstreamTransport(options.config.timeoutMs, options.config.requestBodyLimitBytes);
    const excluded = new Set<string>();
    let lastError: unknown;

    while (excluded.size < options.runtime.states.length) {
      let state: CredentialState;
      try {
        state = await options.runtime.admit(model, Date.now(), excluded);
      } catch (error) {
        throw lastError ?? error;
      }
      let releaseImmediately = true;
      try {
        if (!state.session?.instanceId) {
          throw new NoAvailableCredentialError("session missing instance");
        }
        const result = await forwardChat({
          transport,
          apiBase: options.config.apiBase,
          token: state.account.authToken,
          instanceId: state.session.instanceId,
          request: { ...parsed, model },
          clientId: state.account.fingerprintId || state.account.id,
        });
        if (parsed.stream) {
          const source = result.stream ?? Readable.from([result.text ?? ""]);
          const visibleStream = await primeVisibleSse(source, options.config.requestBodyLimitBytes);
          releaseImmediately = false;
          return sendStream(reply, visibleStream, () => options.runtime.release(state));
        }
        return reply.code(result.status).send(result.json);
      } catch (error) {
        const retryable = shouldRetry(error);
        if (retryable) {
          lastError = error;
          excluded.add(state.account.id);
          options.runtime.cooldown(state);
        }
        if (!retryable || excluded.size >= options.runtime.states.length) throw error;
      } finally {
        if (releaseImmediately) options.runtime.release(state);
      }
    }
    throw lastError ?? new NoAvailableCredentialError();
  });
}

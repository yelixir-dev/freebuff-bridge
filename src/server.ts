import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import { z, ZodError } from "zod";

import { assertBridgeAuth } from "./auth.js";
import { loadBridgeConfig } from "./config.js";
import { resolveModel } from "./config.js";
import { dashboardHtml } from "./dashboard.js";
import {
  AuthError,
  BridgeError,
  ModelNotAllowedError,
  NoAvailableCredentialError,
} from "./errors.js";
import { isLoopbackBootstrapRequest, shouldRequireAuth } from "./http-guards.js";
import { publicModelObject } from "./model-catalog.js";
import { openaiError } from "./openai.js";
import { fetchSessionTransport, BridgeRuntime } from "./runtime.js";
import { FreebuffSessionClient } from "./session.js";
import { forwardChat, type UpstreamTransport } from "./upstream.js";
import { BRIDGE_VERSION } from "./version.js";
import type { BridgeConfig, OpenAIChatCompletionRequest } from "./types.js";

const chatSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["developer", "system", "user", "assistant", "tool"]),
        content: z
          .union([z.string(), z.array(z.record(z.string(), z.unknown())), z.null()])
          .optional(),
      }),
    )
    .min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  tools: z.array(z.unknown()).optional(),
  stream_options: z.object({ include_usage: z.boolean().optional() }).optional(),
});

export interface CreateAppOptions {
  readonly config?: BridgeConfig;
  readonly runtime?: BridgeRuntime;
  readonly upstream?: UpstreamTransport;
}

function sendError(reply: FastifyReply, error: unknown): FastifyReply {
  if (error instanceof ZodError) {
    return reply.code(400).send(openaiError(400, error.message).body);
  }
  if (error instanceof BridgeError) {
    return reply.code(error.statusCode).send(openaiError(error.statusCode, error.message).body);
  }
  const message = error instanceof Error ? error.message : "internal_error";
  return reply.code(500).send(openaiError(500, message, "server_error").body);
}

function adminView(runtime: BridgeRuntime, config: BridgeConfig) {
  return {
    version: BRIDGE_VERSION,
    server: { host: config.host, port: config.port },
    routing: {
      policy: config.routingPolicy,
      maxConcurrent: runtime.maxConcurrent(),
      accountCount: runtime.states.length,
    },
    bridgeApiKey: config.bridgeApiKey ? "sk-[REDACTED]" : "",
    models: config.models,
    credentials: runtime.diagnostics(),
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadBridgeConfig();
  const runtime =
    options.runtime ??
    new BridgeRuntime(
      config,
      new FreebuffSessionClient(config.apiBase, fetchSessionTransport(20_000)),
    );
  const app = Fastify({ logger: { level: config.logLevel } });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigin || true });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindow });

  app.addHook("preHandler", async (request) => {
    if (!shouldRequireAuth(request)) return;
    if (!config.bridgeApiKey && isLoopbackBootstrapRequest(request)) return;
    assertBridgeAuth(
      config.bridgeApiKey,
      request.headers.authorization,
      typeof request.headers["x-api-key"] === "string" ? request.headers["x-api-key"] : undefined,
    );
  });

  app.get("/health", async () => ({
    status: "ok",
    version: BRIDGE_VERSION,
    host: config.host,
    port: config.port,
    credentials: runtime.states.length,
    defaultModel: config.defaultModel,
  }));
  app.get("/dashboard", async (_request, reply) =>
    reply.type("text/html").send(dashboardHtml(adminView(runtime, config))),
  );
  app.get("/v1/models", async () => ({
    object: "list",
    data: config.models.filter((model) => model.enabled).map(publicModelObject),
  }));
  app.get("/admin/config", async () => adminView(runtime, config));
  app.get("/admin/freebuff/credentials", async (request) => {
    if (typeof request.query === "object" && request.query && "refresh" in request.query) {
      await runtime.refreshAll();
    }
    return { credentials: runtime.diagnostics() };
  });
  app.post("/admin/freebuff/credentials", async (request) => {
    const body = z
      .object({ authToken: z.string().min(8), label: z.string().optional() })
      .parse(request.body);
    runtime.addAccount({
      id: body.label?.trim() || `token-${runtime.states.length + 1}`,
      label: body.label?.trim() || `token-${runtime.states.length + 1}`,
      authToken: body.authToken.trim(),
      fingerprintId: "",
      fingerprintHash: "",
      enabled: true,
    });
    return { credentials: runtime.diagnostics() };
  });
  app.put("/admin/config", async (request) => {
    const body = z
      .object({
        server: z.object({ host: z.string(), port: z.number() }).optional(),
        routing: z
          .object({
            policy: z.enum(["thin_long", "short_thick"]),
            maxConcurrent: z.number().int().min(0).optional(),
          })
          .optional(),
        models: z.array(z.object({ id: z.string(), enabled: z.boolean() })).optional(),
        bridgeApiKey: z.string().optional(),
      })
      .parse(request.body);
    if (body.server) {
      (config as { host: string }).host = body.server.host;
      (config as { port: number }).port = body.server.port;
    }
    if (body.bridgeApiKey !== undefined) {
      (config as { bridgeApiKey: string }).bridgeApiKey = body.bridgeApiKey.trim();
    }
    if (body.routing) {
      (config as { routingPolicy: string }).routingPolicy = body.routing.policy;
      if (body.routing.maxConcurrent !== undefined) {
        (config as { maxConcurrent: number }).maxConcurrent = body.routing.maxConcurrent;
      }
    }
    if (body.models) {
      for (const update of body.models) {
        const model = config.models.find((item) => item.id === update.id);
        if (model) (model as { enabled: boolean }).enabled = update.enabled;
      }
    }
    return adminView(runtime, config);
  });
  app.post("/admin/restart", async () => ({
    ok: true,
    note: "in-process restart is a no-op in source mode",
  }));

  app.post("/v1/chat/completions", async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const parsed = chatSchema.parse(request.body) as OpenAIChatCompletionRequest;
      const model = resolveModel(config, parsed.model);
      const state = await runtime.admit(model);
      try {
        if (!state.session?.instanceId)
          throw new NoAvailableCredentialError("session missing instance");
        if (!options.upstream) {
          const transport: UpstreamTransport = {
            async chat({ url, headers, body, stream }) {
              const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(config.timeoutMs),
              });
              if (stream) return { status: response.status, text: await response.text() };
              return { status: response.status, json: await response.json() };
            },
          };
          const result = await forwardChat({
            transport,
            apiBase: config.apiBase,
            token: state.account.authToken,
            instanceId: state.session.instanceId,
            request: { ...parsed, model },
            clientId: state.account.fingerprintId || state.account.id,
          });
          if (parsed.stream) return reply.type("text/event-stream").send(result.text ?? "");
          return result.json;
        }
        const result = await forwardChat({
          transport: options.upstream,
          apiBase: config.apiBase,
          token: state.account.authToken,
          instanceId: state.session.instanceId,
          request: { ...parsed, model },
          clientId: state.account.fingerprintId || state.account.id,
        });
        if (parsed.stream) return reply.type("text/event-stream").send(result.text ?? "");
        return result.json;
      } finally {
        runtime.release(state);
      }
    } catch (error) {
      if (error instanceof AuthError || error instanceof ModelNotAllowedError)
        return sendError(reply, error);
      return sendError(reply, error);
    }
  });

  return app;
}

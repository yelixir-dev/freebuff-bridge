import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError, z } from "zod";

import { assertBridgeAuth } from "./auth.js";
import { registerChatRoute } from "./chat-route.js";
import { loadBridgeConfig } from "./config.js";
import { dashboardHtml } from "./dashboard.js";
import { AuthError, BridgeError } from "./errors.js";
import { isLoopbackBootstrapRequest, shouldRequireAuth } from "./http-guards.js";
import { publicModelObject } from "./model-catalog.js";
import { openaiError } from "./openai.js";
import { fetchSessionTransport, BridgeRuntime } from "./runtime.js";
import { FreebuffSessionClient } from "./session.js";
import type { UpstreamTransport } from "./upstream.js";
import { BRIDGE_VERSION } from "./version.js";
import type { BridgeConfig } from "./types.js";

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
    const type = error.statusCode >= 500 ? "upstream_error" : "invalid_request_error";
    return reply
      .code(error.statusCode)
      .send(openaiError(error.statusCode, error.message, type, error.code).body);
  }
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;
  const message =
    statusCode < 500 && error instanceof Error ? error.message : "Internal server error";
  return reply.code(statusCode).send(openaiError(statusCode, message, "server_error").body);
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
      new FreebuffSessionClient(
        config.apiBase,
        fetchSessionTransport(20_000, config.requestBodyLimitBytes),
      ),
    );
  const app = Fastify({
    bodyLimit: config.requestBodyLimitBytes,
    logger: { level: config.logLevel },
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.corsOrigin || false });
  await app.register(rateLimit, { max: config.rateLimitMax, timeWindow: config.rateLimitWindow });
  app.setErrorHandler((error, _request, reply) => sendError(reply, error));

  app.addHook("preHandler", async (request) => {
    if (!shouldRequireAuth(request)) return;
    if (!config.bridgeApiKey && isLoopbackBootstrapRequest(request)) return;
    if (!config.bridgeApiKey) throw new AuthError();
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
  app.get("/dashboard", async (_request, reply) => reply.type("text/html").send(dashboardHtml()));
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

  registerChatRoute(app, {
    config,
    runtime,
    ...(options.upstream ? { upstream: options.upstream } : {}),
  });

  return app;
}

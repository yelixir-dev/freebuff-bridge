import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { ZodError, z } from "zod";

import { assertBridgeAuth } from "./auth.js";
import { registerChatRoute } from "./chat-route.js";
import { loadBridgeConfig } from "./config.js";
import { writeDashboardConfigFile } from "./dashboard-config.js";
import { dashboardHtml } from "./dashboard.js";
import { AuthError, BridgeError } from "./errors.js";
import { isLoopbackBootstrapRequest, shouldRequireAuth } from "./http-guards.js";
import { publicModelObject } from "./model-catalog.js";
import { openaiError } from "./openai.js";
import { redactedPreview } from "./router.js";
import { fetchSessionTransport, BridgeRuntime } from "./runtime.js";
import { FreebuffSessionClient } from "./session.js";
import type { UpstreamTransport } from "./upstream.js";
import { BRIDGE_VERSION } from "./version.js";
import type { BridgeConfig, FreebuffAccount } from "./types.js";

export interface CreateAppOptions {
  readonly config?: BridgeConfig;
  readonly restart?: () => Promise<void>;
  readonly runtime?: BridgeRuntime;
  readonly upstream?: UpstreamTransport;
}

const dashboardUpdateSchema = z.object({
  bridgeApiKey: z.string().trim().min(1).optional(),
  server: z
    .object({
      host: z.enum(["127.0.0.1", "0.0.0.0"]),
      port: z.number().int().min(1).max(65_535),
    })
    .optional(),
  routing: z
    .object({
      policy: z.enum(["thin_long", "short_thick"]),
      maxConcurrent: z.number().int().min(0),
    })
    .optional(),
  models: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        enabled: z.boolean(),
      }),
    )
    .optional(),
  credentials: z
    .array(
      z.object({
        id: z.string().trim().min(1),
        originalId: z.string().trim().min(1).optional(),
        label: z.string().trim().min(1),
        authToken: z.string().trim().min(1).optional(),
        enabled: z.boolean(),
      }),
    )
    .optional(),
});

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

function adminView(runtime: BridgeRuntime, config: BridgeConfig, dirty: boolean) {
  const diagnostics = new Map(runtime.diagnostics().map((item) => [item.id, item]));
  const credentials = config.dashboardCredentials ?? runtime.states.map((state) => state.account);
  return {
    version: BRIDGE_VERSION,
    dirty,
    restart_required: dirty,
    server: { host: config.host, port: config.port },
    routing: {
      policy: config.routingPolicy,
      maxConcurrent: config.maxConcurrent,
      accountCount: credentials.length,
    },
    bridgeApiKey: config.bridgeApiKey ? "sk-[REDACTED]" : "",
    models: config.models,
    credentials: credentials.map((account) => ({
      ...(diagnostics.get(account.id) ?? {
        status: "none",
        remaining: null,
        quota: null,
        disabledUntil: null,
      }),
      id: account.id,
      label: account.label,
      enabled: account.enabled,
      authTokenConfigured: Boolean(account.authToken),
      authTokenPreview: redactedPreview(account.authToken),
    })),
  };
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? loadBridgeConfig();
  let dashboardConfig = config;
  let configDirty = false;
  let activeBridgeApiKey = config.bridgeApiKey;
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
    if (!activeBridgeApiKey && isLoopbackBootstrapRequest(request)) return;
    if (!activeBridgeApiKey) throw new AuthError();
    assertBridgeAuth(
      activeBridgeApiKey,
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
  app.get("/admin/config", async () => adminView(runtime, dashboardConfig, configDirty));
  app.get("/admin/freebuff/credentials", async (request) => {
    if (typeof request.query === "object" && request.query && "refresh" in request.query) {
      await runtime.refreshAll();
    }
    return { credentials: adminView(runtime, dashboardConfig, configDirty).credentials };
  });
  app.put("/admin/config", async (request) => {
    const body = dashboardUpdateSchema.parse(request.body);
    const currentCredentials =
      dashboardConfig.dashboardCredentials ?? runtime.states.map((state) => state.account);
    const currentById = new Map(currentCredentials.map((account) => [account.id, account]));
    const ids = new Set<string>();
    const tokens = new Set<string>();
    const credentials: FreebuffAccount[] = [];
    for (const item of body.credentials ?? currentCredentials) {
      if (ids.has(item.id)) {
        throw new BridgeError(
          "duplicate_credential_id",
          `Duplicate credential id: ${item.id}`,
          409,
        );
      }
      const originalId = "originalId" in item ? item.originalId : undefined;
      const suppliedToken = "authToken" in item ? item.authToken : undefined;
      const existing = currentById.get(originalId ?? item.id) ?? currentById.get(item.id);
      const authToken = suppliedToken ?? existing?.authToken;
      if (!authToken) continue;
      if (tokens.has(authToken)) {
        throw new BridgeError(
          "duplicate_freebuff_auth_token",
          "The same Freebuff auth token cannot be saved twice",
          409,
        );
      }
      ids.add(item.id);
      tokens.add(authToken);
      credentials.push({
        id: item.id,
        label: item.label,
        authToken,
        fingerprintId: existing?.fingerprintId ?? "",
        fingerprintHash: existing?.fingerprintHash ?? "",
        enabled: item.enabled,
      });
    }
    const enabledById = new Map(body.models?.map((model) => [model.id, model.enabled]));
    dashboardConfig = {
      ...dashboardConfig,
      host: body.server?.host ?? dashboardConfig.host,
      port: body.server?.port ?? dashboardConfig.port,
      bridgeApiKey: body.bridgeApiKey ?? dashboardConfig.bridgeApiKey,
      routingPolicy: body.routing?.policy ?? dashboardConfig.routingPolicy,
      maxConcurrent: body.routing?.maxConcurrent ?? dashboardConfig.maxConcurrent,
      dashboardCredentials: credentials,
      models: dashboardConfig.models.map((model) => ({
        ...model,
        enabled: enabledById.get(model.id) ?? model.enabled,
      })),
    };
    writeDashboardConfigFile(config.dashboardConfigPath, {
      bridgeApiKey: dashboardConfig.bridgeApiKey,
      server: { host: dashboardConfig.host, port: dashboardConfig.port },
      routing: {
        policy: dashboardConfig.routingPolicy,
        maxConcurrent: dashboardConfig.maxConcurrent,
      },
      models: dashboardConfig.models.map(({ id, enabled }) => ({ id, enabled })),
      credentials,
    });
    activeBridgeApiKey = dashboardConfig.bridgeApiKey;
    configDirty = true;
    return adminView(runtime, dashboardConfig, configDirty);
  });
  app.post("/admin/restart", async (_request, reply) => {
    configDirty = false;
    if (options.restart) {
      reply.raw.once("finish", () => {
        void options.restart?.().catch((error: unknown) => {
          app.log.error(error, "Dashboard service recycle failed");
        });
      });
    }
    return reply.send({ ok: true, restart_requested: true });
  });

  registerChatRoute(app, {
    config,
    runtime,
    ...(options.upstream ? { upstream: options.upstream } : {}),
  });

  return app;
}

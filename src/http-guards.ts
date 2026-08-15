import type { FastifyRequest } from "fastify";

export function shouldRequireAuth(request: FastifyRequest): boolean {
  if (request.method === "OPTIONS") return false;
  return request.url.startsWith("/v1/") || request.url.startsWith("/admin/");
}

export function isLoopbackBootstrapRequest(request: FastifyRequest): boolean {
  const address = request.ip.startsWith("::ffff:") ? request.ip.slice(7) : request.ip;
  const hostHeader = request.headers.host ?? "";
  const hostname = hostHeader.startsWith("[")
    ? hostHeader.slice(1, hostHeader.indexOf("]"))
    : hostHeader.split(":")[0]?.toLowerCase();
  const loopbackHost = hostname === "127.0.0.1" || hostname === "localhost" || hostname === "::1";
  return (address === "::1" || address.startsWith("127.")) && loopbackHost;
}

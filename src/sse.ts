import { Readable } from "node:stream";
import { StringDecoder } from "node:string_decoder";

import {
  BridgeError,
  EmptyVisibleResponseError,
  InvalidUpstreamResponseError,
  UpstreamError,
} from "./errors.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  return Buffer.from(String(value));
}

function eventData(event: string): string {
  return event
    .split(/\r?\n/)
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice(5).trimStart())
    .join("\n");
}

function eventIsVisible(event: string): boolean {
  const data = eventData(event);
  if (!data) return false;
  if (data === "[DONE]") throw new EmptyVisibleResponseError();
  let payload: unknown;
  try {
    payload = JSON.parse(data);
  } catch {
    throw new InvalidUpstreamResponseError("Freebuff upstream returned malformed SSE data");
  }
  if (!isRecord(payload)) return false;
  if (isRecord(payload["error"])) {
    const message =
      typeof payload["error"]["message"] === "string"
        ? payload["error"]["message"]
        : "Freebuff upstream returned an SSE error";
    throw new UpstreamError(message, 502);
  }
  if (!Array.isArray(payload["choices"])) return false;
  return payload["choices"].some((choice) => {
    if (!isRecord(choice)) return false;
    const delta = isRecord(choice["delta"])
      ? choice["delta"]
      : isRecord(choice["message"])
        ? choice["message"]
        : undefined;
    if (!delta) return false;
    const text = [delta["content"], delta["reasoning"], delta["reasoning_content"]].find(
      (value) => typeof value === "string" && value.trim().length > 0,
    );
    const toolCalls = Array.isArray(delta["tool_calls"]) ? delta["tool_calls"] : [];
    const toolCallStart = toolCalls.some((toolCall) => {
      if (!isRecord(toolCall) || toolCall["type"] !== "function") return false;
      if (typeof toolCall["id"] !== "string" || !toolCall["id"]) return false;
      const fn = toolCall["function"];
      return isRecord(fn) && typeof fn["name"] === "string" && fn["name"].length > 0;
    });
    return text !== undefined || toolCallStart;
  });
}

async function* replay(
  buffered: readonly Buffer[],
  iterator: AsyncIterator<unknown>,
  source: Readable,
): AsyncGenerator<Buffer> {
  try {
    for (const chunk of buffered) yield chunk;
    for (;;) {
      const next = await iterator.next();
      if (next.done) return;
      yield asBuffer(next.value);
    }
  } catch {
    const payload = {
      error: {
        message: "Freebuff upstream stream failed after output started",
        type: "upstream_error",
        code: "freebuff_stream_error",
      },
    };
    yield Buffer.from(`\n\ndata: ${JSON.stringify(payload)}\n\ndata: [DONE]\n\n`);
  } finally {
    source.destroy();
  }
}

export async function primeVisibleSse(
  source: Readable,
  maxBufferedBytes = 1_048_576,
): Promise<Readable> {
  const iterator: AsyncIterator<unknown> = source[Symbol.asyncIterator]();
  const decoder = new StringDecoder("utf8");
  const buffered: Buffer[] = [];
  let pending = "";
  let bufferedBytes = 0;

  try {
    for (;;) {
      const next = await iterator.next();
      if (next.done) throw new EmptyVisibleResponseError();
      const chunk = asBuffer(next.value);
      bufferedBytes += chunk.byteLength;
      if (bufferedBytes > maxBufferedBytes) {
        throw new InvalidUpstreamResponseError(
          "Freebuff upstream exceeded the pre-output stream buffer limit",
        );
      }
      buffered.push(chunk);
      pending += decoder.write(chunk);

      for (;;) {
        const match = /\r?\n\r?\n/.exec(pending);
        if (!match || match.index === undefined) break;
        const event = pending.slice(0, match.index);
        pending = pending.slice(match.index + match[0].length);
        if (eventIsVisible(event)) return Readable.from(replay(buffered, iterator, source));
      }
    }
  } catch (error) {
    source.destroy();
    if (error instanceof BridgeError) throw error;
    const message = error instanceof Error ? error.message : "Freebuff upstream stream failure";
    throw new UpstreamError(message, 503);
  }
}

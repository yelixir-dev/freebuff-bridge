import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";

import { UpstreamError } from "./errors.js";
import { readBoundedText } from "./http-body.js";
import type { UpstreamTransport } from "./upstream.js";

export function createFetchUpstreamTransport(
  timeoutMs: number,
  maxResponseBytes: number,
): UpstreamTransport {
  return {
    async chat({ url, headers, body, stream }) {
      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Freebuff upstream network failure";
        throw new UpstreamError(message, 503);
      }
      if (stream) {
        if (response.status >= 400) {
          return {
            status: response.status,
            text: await readBoundedText(response, maxResponseBytes),
          };
        }
        return {
          status: response.status,
          ...(response.body
            ? {
                stream: Readable.fromWeb(response.body as WebReadableStream<Uint8Array>),
              }
            : {}),
        };
      }
      const text = await readBoundedText(response, maxResponseBytes);
      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        json = undefined;
      }
      return { status: response.status, json, text };
    },
  };
}

export function releaseAfterStream(stream: Readable, release: () => void): void {
  let released = false;
  const releaseOnce = (): void => {
    if (released) return;
    released = true;
    release();
  };
  stream.once("end", releaseOnce);
  stream.once("error", releaseOnce);
  stream.once("close", releaseOnce);
}

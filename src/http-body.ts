import { InvalidUpstreamResponseError } from "./errors.js";

export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new InvalidUpstreamResponseError("Freebuff upstream response exceeded the byte limit");
  }
  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const next = await reader.read();
    if (next.done) break;
    total += next.value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new InvalidUpstreamResponseError("Freebuff upstream response exceeded the byte limit");
    }
    chunks.push(next.value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

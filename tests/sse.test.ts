import { Readable } from "node:stream";

import { describe, expect, it } from "vitest";

import { primeVisibleSse } from "../src/sse.js";

async function body(stream: Readable): Promise<string> {
  let output = "";
  for await (const chunk of stream) output += String(chunk);
  return output;
}

describe("primeVisibleSse", () => {
  it("rejects a stream that ends before visible output", async () => {
    await expect(
      primeVisibleSse(Readable.from(['data: {"choices":[]}\n\n', "data: [DONE]\n\n"])),
    ).rejects.toMatchObject({ code: "freebuff_empty_visible_response" });
  });

  it("replays buffered events after the first visible delta", async () => {
    const stream = await primeVisibleSse(
      Readable.from([
        'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"hello"}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    await expect(body(stream)).resolves.toContain('"content":"hello"');
  });

  it("rejects malformed streamed tool calls", async () => {
    await expect(
      primeVisibleSse(
        Readable.from([
          'data: {"choices":[{"delta":{"tool_calls":[{}]}}]}\n\n',
          "data: [DONE]\n\n",
        ]),
      ),
    ).rejects.toMatchObject({ code: "freebuff_empty_visible_response" });
  });

  it("accepts a structurally valid streamed tool call", async () => {
    const stream = await primeVisibleSse(
      Readable.from([
        'data: {"choices":[{"delta":{"tool_calls":[{"id":"call-1","type":"function","function":{"name":"Bash","arguments":""}}]}}]}\n\n',
        "data: [DONE]\n\n",
      ]),
    );

    await expect(body(stream)).resolves.toContain('"id":"call-1"');
  });

  it("terminates a post-visible stream failure with an OpenAI error frame", async () => {
    const source = new Readable({
      read() {
        this.push('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
        this.destroy(new Error("connection reset"));
      },
    });
    const stream = await primeVisibleSse(source);

    const output = await body(stream);

    expect(output).toContain('"code":"freebuff_stream_error"');
    expect(output).toContain("data: [DONE]");
  });

  it("separates an error frame from a partial trailing SSE event", async () => {
    const source = new Readable({
      read() {
        this.push('data: {"choices":[{"delta":{"content":"hello"}}]}\n\n');
        this.push('data: {"choices":[');
        this.destroy(new Error("connection reset"));
      },
    });
    const output = await body(await primeVisibleSse(source));

    expect(output).toContain('data: {"choices":[\n\ndata: {"error"');
    expect(output).toContain("data: [DONE]");
  });
});

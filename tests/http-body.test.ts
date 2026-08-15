import { describe, expect, it } from "vitest";

import { readBoundedText } from "../src/http-body.js";

describe("readBoundedText", () => {
  it("reads a response within the configured limit", async () => {
    await expect(readBoundedText(new Response("hello"), 5)).resolves.toBe("hello");
  });

  it("rejects an oversized upstream response", async () => {
    await expect(readBoundedText(new Response("too large"), 4)).rejects.toMatchObject({
      code: "freebuff_invalid_response",
    });
  });
});

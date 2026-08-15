import { BridgeError } from "./errors.js";
import type { OpenAIChatMessage } from "./types.js";

function invalid(message: string): never {
  throw new BridgeError("invalid_tool_history", message, 400);
}

export function assertValidToolHistory(messages: readonly OpenAIChatMessage[]): void {
  const seen = new Set<string>();
  const pending = new Map<string, string>();

  for (const message of messages) {
    if (pending.size > 0 && message.role !== "tool") {
      invalid("Every assistant tool call must be followed by its matching tool result");
    }

    const calls = message.tool_calls ?? [];
    if (calls.length > 0) {
      if (message.role !== "assistant") {
        invalid("Only assistant messages may contain tool calls");
      }
      for (const call of calls) {
        if (!call.id) invalid("Assistant tool calls require a non-empty id");
        if (seen.has(call.id)) invalid(`Duplicate tool call id: ${call.id}`);
        seen.add(call.id);
        pending.set(call.id, call.function.name);
      }
    }

    if (message.role !== "tool") continue;
    if (!message.tool_call_id) invalid("Tool result messages require tool_call_id");
    const expectedName = pending.get(message.tool_call_id);
    if (!expectedName) invalid(`Unknown tool result id: ${message.tool_call_id}`);
    if (message.name && message.name !== expectedName) {
      invalid(`Tool result name does not match call ${message.tool_call_id}`);
    }
    pending.delete(message.tool_call_id);
  }

  if (pending.size > 0) {
    invalid("Every assistant tool call must have a matching tool result");
  }
}

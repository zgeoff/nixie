import type { CallToolResult } from '@modelcontextprotocol/server';

// The result that a tool call returns when the tool refuses with a message.
export function buildToolErrorResult(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

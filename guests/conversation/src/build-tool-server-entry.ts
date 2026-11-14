import type { McpServerConfig } from '@anthropic-ai/claude-agent-sdk';

// The CLI's per-server tool-call timeout is a hard wall-clock limit in milliseconds, the unit of the
// frame's limit. A null wait leaves the key off, so the CLI keeps its own default.
export function buildToolServerEntry(
  toolServer: McpServerConfig,
  toolCallWaitMs: number | null,
): McpServerConfig {
  return toolCallWaitMs === null ? toolServer : { ...toolServer, timeout: toolCallWaitMs };
}

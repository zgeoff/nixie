import type { McpOverrides, McpToolOverride } from '../types';

// The override of one tool of one server, or null. A name such as `constructor` is no override
// unless the file names it, so only own entries count.
export function findMcpToolOverride(
  overrides: McpOverrides,
  serverID: string,
  tool: string,
): McpToolOverride | null {
  const server = Object.hasOwn(overrides, serverID) ? overrides[serverID] : undefined;

  return server !== undefined && Object.hasOwn(server, tool) ? (server[tool] ?? null) : null;
}

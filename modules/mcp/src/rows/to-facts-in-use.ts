import type { ServerFacts } from '../types';
import type { McpServerRow } from './mcp-tables';

// The facts in use for a server row, or null for a server that was never approved.
export function toFactsInUse(row: McpServerRow): ServerFacts | null {
  if (row.url === null || row.client_id === null || row.scope === null) {
    return null;
  }

  return {
    url: row.url,
    clientID: row.client_id,
    scope: row.scope,
    privateRange: row.private_range,
  };
}

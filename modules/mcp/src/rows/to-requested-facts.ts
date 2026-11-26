import { serverFactsSchema } from '../record/server-facts-schema';
import type { ServerFacts } from '../types';
import type { McpServerRow } from './mcp-tables';

// The facts that the row's open or declined proposal asks for, or null when it holds none.
export function toRequestedFacts(row: McpServerRow): ServerFacts | null {
  if (row.requested === null) {
    return null;
  }

  return serverFactsSchema.parse(JSON.parse(row.requested));
}

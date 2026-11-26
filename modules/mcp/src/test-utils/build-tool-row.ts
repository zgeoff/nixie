import type { McpToolRow } from '../rows/mcp-tables';

// One row of the tools table with every field set, for a test to change one field of.
export function buildToolRow(overrides: Partial<McpToolRow> = {}): McpToolRow {
  return {
    tool: 'tracker.item_get',
    server_id: 'tracker',
    pinned_hash: 'sha256:a',
    latest_hash: 'sha256:a',
    state: 'exposed',
    hidden_reason: null,
    proposal_id: null,
    updated_sequence: 1,
    ...overrides,
  };
}

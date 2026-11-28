import type { McpServerRow } from '../rows/mcp-tables';

// One row of the servers table with every field set, for a test to change one field of.
export function buildServerRow(overrides: Partial<McpServerRow> = {}): McpServerRow {
  return {
    server_id: 'tracker',
    state: 'added',
    url: 'https://tracker.example.org/mcp',
    client_id: 'nixie-1',
    scope: 'read',
    trusted: null,
    private_range: null,
    requested: null,
    proposal_id: null,
    client_credential_id: null,
    grant_credential_id: null,
    grant_binding: null,
    updated_sequence: 1,
    ...overrides,
  };
}

import type { CheckedTables } from '@heynixie/db';
import type { PinState, ServerState } from '../types';

export interface McpServerRow {
  readonly server_id: string;
  readonly state: ServerState;

  // the facts in use; null until the first approval
  readonly url: string | null;
  readonly client_id: string | null;
  readonly scope: string | null;
  readonly private_range: string | null;

  // unused: a server has no trust fact, and no fold writes the column
  readonly trusted: number | null;

  // JSON of the facts the open or the declined proposal asks for
  readonly requested: string | null;
  readonly proposal_id: string | null;
  readonly client_credential_id: string | null;
  readonly grant_credential_id: string | null;

  // JSON of the GrantBinding the grant was signed in under; null until a sign-in finishes
  readonly grant_binding: string | null;
  readonly updated_sequence: number;
}

export interface McpToolRow {
  readonly tool: string;
  readonly server_id: string;
  readonly pinned_hash: string | null;
  readonly latest_hash: string;
  readonly state: PinState;
  readonly hidden_reason: string | null;
  readonly proposal_id: string | null;
  readonly updated_sequence: number;
}

export type McpTables = CheckedTables<
  Readonly<{
    mcp_servers: McpServerRow;
    mcp_tools: McpToolRow;
    mcp_tool_forms: { readonly hash: string; readonly listed_seq: number };
  }>
>;

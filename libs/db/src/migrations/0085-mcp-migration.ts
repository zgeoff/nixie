import { sql } from 'kysely';
import type { Migration } from '../types';

export const mcpMigration: Migration = {
  name: 'create the tables of the MCP servers, their tools and the tool forms that listings held',
  up: async (tx) => {
    // The facts in use, folded from `mcp.server_changed` records. A server that was never approved
    // has no facts in use, and its requested facts wait for the proposal.
    await sql`create table if not exists mcp_servers (
      server_id text primary key,
      state text not null check (state in ('held', 'added', 'removed')),
      url text,
      client_id text,
      scope text,
      trusted integer,
      private_range text,
      requested text,
      proposal_id text,
      client_credential_id text,
      grant_credential_id text,
      grant_binding text,
      updated_sequence integer not null
    ) strict`.execute(tx);

    // One row per tool a server listing has held. The tool is '<serverID>.<tool>'.
    await sql`create table if not exists mcp_tools (
      tool text primary key,
      server_id text not null,
      pinned_hash text,
      latest_hash text not null,
      state text not null check (
        state in ('exposed', 'stopped_changed', 'stopped_unfit', 'hidden_new', 'removed')
      ),
      hidden_reason text,
      proposal_id text,
      updated_sequence integer not null
    ) strict`.execute(tx);

    await sql`create index if not exists mcp_tools_by_server
      on mcp_tools (server_id, tool)`.execute(tx);

    // One row per tool form a listing has held. The form sits in the erasable fields of the record.
    await sql`create table if not exists mcp_tool_forms (
      hash text primary key,
      listed_seq integer not null
    ) strict`.execute(tx);
  },
};

import type { Projection } from '@heynixie/log';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import type { McpTables } from './mcp-tables';

// One row per tool a listing has held, replaced whole by each `mcp.tool_changed` record.
export const mcpToolsProjection: Projection = {
  table: 'mcp_tools',
  keyColumn: 'tool',
  fold: async (tx, record) => {
    if (record.kind !== mcpToolChangedCodec.kind) {
      return [];
    }

    const changed = mcpToolChangedCodec.decode(record.payload);

    const columns = {
      server_id: changed.serverID,
      pinned_hash: changed.pinnedHash,
      latest_hash: changed.latestHash,
      state: changed.state,
      hidden_reason: changed.hiddenReason,
      proposal_id: changed.proposalID,
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<McpTables>()
      .insertInto('mcp_tools')
      .values({ tool: changed.tool, ...columns })
      .onConflict((conflict) => conflict.column('tool').doUpdateSet(columns))
      .execute();

    return [changed.tool];
  },
};

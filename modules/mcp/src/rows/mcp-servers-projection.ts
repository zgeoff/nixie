import type { Projection } from '@heynixie/log';
import { mcpServerChangedCodec } from '../record/mcp-server-changed-codec';
import type { McpTables } from './mcp-tables';

// One row per configured server, replaced whole by each `mcp.server_changed` record.
export const mcpServersProjection: Projection = {
  table: 'mcp_servers',
  keyColumn: 'server_id',
  fold: async (tx, record) => {
    if (record.kind !== mcpServerChangedCodec.kind) {
      return [];
    }

    const changed = mcpServerChangedCodec.decode(record.payload);
    const facts = changed.facts;

    const columns = {
      state: changed.state,
      url: facts?.url ?? null,
      client_id: facts?.clientID ?? null,
      scope: facts?.scope ?? null,
      private_range: facts?.privateRange ?? null,
      requested: changed.requested === null ? null : JSON.stringify(changed.requested),
      proposal_id: changed.proposalID,
      client_credential_id: changed.clientCredentialID,
      grant_credential_id: changed.grantCredentialID,
      grant_binding: changed.grantBinding === null ? null : JSON.stringify(changed.grantBinding),
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<McpTables>()
      .insertInto('mcp_servers')
      .values({ server_id: changed.serverID, ...columns })
      .onConflict((conflict) => conflict.column('server_id').doUpdateSet(columns))
      .execute();

    return [changed.serverID];
  },
};

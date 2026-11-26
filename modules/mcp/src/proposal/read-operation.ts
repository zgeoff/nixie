import type { Kysely } from 'kysely';
import { readServerRows } from '../rows/read-server-rows';
import { readToolRows } from '../rows/read-tool-rows';
import { toRequestedFacts } from '../rows/to-requested-facts';
import type { McpOperation } from '../types';

// The operation that a proposal asks about, recomputed from the facts and the tool's latest hash as
// they stand now. Null when no server or tool names the proposal any more, such as after a newer
// proposal replaced it.
export async function readOperation(
  db: Kysely<unknown>,
  proposalID: string,
): Promise<McpOperation | null> {
  const servers = await readServerRows(db);

  const server = servers.find((row) => row.proposal_id === proposalID);
  const requested = server === undefined ? null : toRequestedFacts(server);

  if (server !== undefined && requested !== null) {
    return { change: 'server', serverID: server.server_id, facts: requested };
  }

  const tools = await readToolRows(db);

  const tool = tools.find((row) => row.proposal_id === proposalID);

  if (tool === undefined) {
    return null;
  }

  return { change: 'allow', tool: tool.tool, fromHash: tool.pinned_hash, hash: tool.latest_hash };
}

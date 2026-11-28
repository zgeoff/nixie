import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { mcpToolChangedCodec } from '../record/mcp-tool-changed-codec';
import { readToolRow } from '../rows/read-tool-rows';
import type { McpContext } from '../types';
import { writeMcpProposal } from './write-mcp-proposal';

export type AllowResult =
  | { readonly status: 'proposed'; readonly tool: string; readonly proposalID: string }
  | { readonly status: 'unknown_tool' }
  | { readonly status: 'nothing_to_allow'; readonly reason: string };

// Writes the accept proposal of a tool that a change stopped, in place of the open one. `nixie mcp
// allow` calls it after you decline a proposal or it lapses, because a listing never proposes the
// same form twice.
export async function allowTool(context: McpContext, tool: string): Promise<AllowResult> {
  const row = await readToolRow(context.log.writer.db, tool);

  if (row === null) {
    return { status: 'unknown_tool' };
  }

  if (row.hidden_reason !== null) {
    return { status: 'nothing_to_allow', reason: row.hidden_reason };
  }

  if (row.state !== 'stopped_changed') {
    return { status: 'nothing_to_allow', reason: `the tool is ${row.state}` };
  }

  const proposalID = await withWriteTransaction(context.log.writer, async (tx) => {
    const id = await writeMcpProposal(tx, context, {
      operation: {
        change: 'allow',
        tool,
        fromHash: row.pinned_hash,
        hash: row.latest_hash,
      },
      replacesProposalID: row.proposal_id,
    });

    // writeMcpProposal withdrew the open proposal, and the row now names the new one
    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpToolChangedCodec.kind,
        definitions: context.definitions(),
        payload: mcpToolChangedCodec.encode({
          serverID: row.server_id,
          tool,
          pinnedHash: row.pinned_hash,
          latestHash: row.latest_hash,
          state: row.state,
          hiddenReason: row.hidden_reason,
          proposalID: id,
        }),
      },
    ]);

    return id;
  });

  return { status: 'proposed', tool, proposalID };
}

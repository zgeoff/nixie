import { createHash } from 'node:crypto';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { buildProposeDeps, proposeInTransaction } from '@heynixie/proposals';
import { formatCanonicalJSON } from '../pin/format-canonical-json';
import { makeMcpProposalHandler } from '../proposal/make-mcp-proposal-handler';
import { mcpProposedCodec } from '../record/mcp-proposed-codec';
import { mcpServerChangedCodec } from '../record/mcp-server-changed-codec';
import type { McpContext, ServerFacts } from '../types';

// An open proposal for a server that is not yet added, whose stored hash covers a `trusted` flag
// beside the facts. The module cannot make this state any more, so the seed writes its records.
// Returns the proposal's ID.
export function seedTrustedServerProposal(
  context: McpContext,
  serverID: string,
  facts: ServerFacts,
): Promise<string> {
  return withWriteTransaction(context.log.writer, async (tx) => {
    const operation = { change: 'server' as const, serverID, facts };

    const actionHash = createHash('sha256')
      .update(formatCanonicalJSON({ ...operation, facts: { ...facts, trusted: false } }))
      .digest('hex');

    const proposed = await proposeInTransaction(
      buildProposeDeps({
        log: context.log,
        clock: { now: context.now },
        definitions: context.definitions,
        config: context.proposalConfig,
        handler: makeMcpProposalHandler(context),
      }),
      tx,
      {
        family: 'mcp',
        kind: 'internal_change',
        cause: 'mcp_config',
        riskClass: 'always_ask',
        actionHash,
        ruleHash: null,
        thread: null,
        taskID: null,
        deadlineAt: null,
        sameThing: null,
      },
    );

    const definitions = context.definitions();

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: mcpProposedCodec.kind,
        definitions,
        payload: mcpProposedCodec.encode({
          proposalID: proposed.proposalID,
          shortID: proposed.shortID,
          actionHash,
          operation,
        }),
      },
      {
        kind: mcpServerChangedCodec.kind,
        definitions,
        payload: mcpServerChangedCodec.encode({
          serverID,
          cause: 'held',
          state: 'held',
          facts: null,
          requested: facts,
          proposalID: proposed.proposalID,
          clientCredentialID: null,
          grantCredentialID: null,
          grantBinding: null,
        }),
      },
    ]);

    return proposed.proposalID;
  });
}

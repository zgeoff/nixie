import { writeRecordsInTransaction } from '@heynixie/log';
import { buildProposeDeps, proposeInTransaction, withdrawInTransaction } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { buildOperationHash } from '../operation/build-operation-hash';
import { mcpProposedCodec } from '../record/mcp-proposed-codec';
import type { McpContext, McpOperation } from '../types';
import { makeMcpProposalHandler } from './make-mcp-proposal-handler';

export interface McpProposalRequest {
  readonly operation: McpOperation;

  // The open proposal for the same server or tool, which the new one replaces.
  readonly replacesProposalID: string | null;
}

// Writes one proposal of the mcp family, and withdraws the open one for the same thing. The caller
// writes, in the same transaction, the row record that names the new proposal's ID. An mcp
// proposal has no proposer, so the core never replaces one by itself, and the withdrawal is named.
export async function writeMcpProposal(
  tx: Transaction<unknown>,
  context: McpContext,
  request: McpProposalRequest,
): Promise<string> {
  const deps = buildDeps(context);

  await withdrawProposal(tx, context, request.replacesProposalID);

  const isServer = request.operation.change === 'server';
  const actionHash = buildOperationHash(request.operation);

  const proposed = await proposeInTransaction(deps, tx, {
    family: 'mcp',
    kind: 'internal_change',
    cause: isServer ? 'mcp_config' : 'mcp_allow',
    riskClass: isServer ? 'always_ask' : 'routine',
    actionHash,
    ruleHash: null,
    thread: null,
    taskID: null,
    deadlineAt: null,
    sameThing: null,
  });

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: mcpProposedCodec.kind,
      definitions: context.definitions(),
      payload: mcpProposedCodec.encode({
        proposalID: proposed.proposalID,
        shortID: proposed.shortID,
        actionHash,
        operation: request.operation,
      }),
    },
  ]);

  return proposed.proposalID;
}

// Withdraws a proposal that a newer one replaces, or does nothing when it is closed already.
export async function withdrawProposal(
  tx: Transaction<unknown>,
  context: McpContext,
  proposalID: string | null,
): Promise<void> {
  if (proposalID === null) {
    return;
  }

  await withdrawInTransaction(buildDeps(context), tx, proposalID, { byProposer: false });
}

function buildDeps(context: McpContext) {
  return buildProposeDeps({
    log: context.log,
    clock: { now: context.now },
    definitions: context.definitions,
    config: context.proposalConfig,
    handler: makeMcpProposalHandler(context),
  });
}

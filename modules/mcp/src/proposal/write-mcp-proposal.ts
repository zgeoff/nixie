import { createShortID } from '@heynixie/db';
import type { RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { proposalsWithdrawnCodec, readProposalsByID } from '@heynixie/proposals';
import type { Transaction } from 'kysely';
import { buildOperationHash } from '../operation/build-operation-hash';
import { mcpProposedCodec } from '../record/mcp-proposed-codec';
import type { McpContext, McpOperation } from '../types';

export interface McpProposalRequest {
  readonly operation: McpOperation;

  // The open proposal for the same server or tool, which the new one replaces.
  readonly replacesProposalID: string | null;
}

// Writes one proposal of the mcp family, and withdraws the open one for the same thing. The caller
// writes, in the same transaction, the row record that names the new proposal's ID.
export async function writeMcpProposal(
  tx: Transaction<unknown>,
  context: McpContext,
  request: McpProposalRequest,
): Promise<string> {
  const proposalID = crypto.randomUUID();

  const withdrawals = await readWithdrawals(tx, context, request.replacesProposalID);

  const inputs: RecordInput[] = [
    ...withdrawals,
    {
      kind: mcpProposedCodec.kind,
      definitions: context.definitions(),
      payload: mcpProposedCodec.encode({
        proposalID,
        shortID: createShortID(),
        actionHash: buildOperationHash(request.operation),
        operation: request.operation,
      }),
    },
  ];

  await writeRecordsInTransaction(tx, context.log, inputs);

  return proposalID;
}

// The withdrawal of a proposal that a newer one replaces, or none when it is closed already.
export async function readWithdrawals(
  tx: Transaction<unknown>,
  context: McpContext,
  proposalID: string | null,
): Promise<readonly RecordInput[]> {
  if (proposalID === null) {
    return [];
  }

  const rows = await readProposalsByID(tx, [proposalID]);

  return rows
    .filter((row) => row.state === 'pending' || row.state === 'deferred')
    .map((row): RecordInput => ({
      kind: proposalsWithdrawnCodec.kind,
      definitions: context.definitions(),
      payload: proposalsWithdrawnCodec.encode({ proposalID: row.id }),
    }));
}

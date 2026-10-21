import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalRejection } from './gate-types';
import { requirePendingProposal } from './require-pending-proposal';
import type { MemoryTables, StoreParts } from './types';

export async function writeProposalRejection(
  parts: StoreParts,
  answer: ProposalRejection,
): Promise<void> {
  const log = parts.context.log;

  const row = await withWriteTransaction(log.writer, async (tx) => {
    const pending = await requirePendingProposal(tx.$extendTables<MemoryTables>(), {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash,
      now: parts.context.gate.clock.now(),
    });

    await answer.writeInTransaction?.(tx);

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.proposal_rejected',
        definitions: parts.context.definitions(),
        ...(pending.thread === null ? {} : { thread: pending.thread }),
        payload: { proposalID: pending.proposal_id },
        ...(answer.reason === undefined ? {} : { erasable: { reason: answer.reason } }),
      },
    ]);

    return pending;
  });

  if (row.is_new_item === 1) {
    await removeRecordKey(log, row.item_id);
  }
}

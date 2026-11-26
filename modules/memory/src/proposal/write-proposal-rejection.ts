import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import type { ProposalRejection } from '../gate/gate-context';
import { requirePendingProposal } from '../pending/require-pending-proposal';
import type { MemoryTables, StoreParts } from '../types';

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

    return pending;
  });

  if (row.is_new_item === 1) {
    await removeRecordKey(log, row.item_id);
  }
}

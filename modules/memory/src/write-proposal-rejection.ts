import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ProposalAnswer } from './gate-types';
import { requirePendingProposal } from './require-pending-proposal';
import type { MemoryTables, StoreParts } from './types';

// Rejects a proposal while it is still pending under the hash you saw. A proposal for a new item
// held that item's only key, so the rejection removes the key and the proposed text with it.
export async function writeProposalRejection(
  parts: StoreParts,
  answer: Omit<ProposalAnswer, 'editedText'>,
): Promise<void> {
  const log = parts.context.log;

  const row = await withWriteTransaction(log.writer, async (tx) => {
    const pending = await requirePendingProposal(tx.$extendTables<MemoryTables>(), {
      proposalID: answer.proposalID,
      actionHash: answer.actionHash,
      now: parts.context.gate.clock.now(),
    });

    await writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.proposal_rejected',
        definitions: parts.context.definitions(),
        ...(pending.thread === null ? {} : { thread: pending.thread }),
        payload: { proposalID: pending.proposal_id },
      },
    ]);

    return pending;
  });

  if (row.is_new_item === 1) {
    await removeRecordKey(log, row.item_id);
  }
}

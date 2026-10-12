import { removeRecordKey, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { MemoryTables, StoreParts } from './types';

// Lapses every pending proposal past its lapse time in one transaction, and returns how many. A
// lapsed proposal for a new item held that item's only key, so the key goes after the commit.
export async function runProposalLapses(parts: StoreParts): Promise<number> {
  const log = parts.context.log;
  const due = await withWriteTransaction(log.writer, async (tx) => {
    const rows = await tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_proposals')
      .select(['proposal_id', 'item_id', 'is_new_item', 'thread'])
      .where('status', '=', 'pending')
      .where('lapse_at', '<=', parts.context.gate.clock.now())
      .execute();

    await writeRecordsInTransaction(
      tx,
      log,
      rows.map((row) => ({
        kind: 'memory.proposal_lapsed',
        definitions: parts.context.definitions(),
        ...(row.thread === null ? {} : { thread: row.thread }),
        payload: { proposalID: row.proposal_id },
      })),
    );
    return rows;
  });

  // one key removal at a time, because each checkpoints the key store
  await due
    .filter((row) => row.is_new_item === 1)
    .reduce(
      (removed, row) => removed.then(() => removeRecordKey(log, row.item_id)),
      Promise.resolve(),
    );
  return due.length;
}

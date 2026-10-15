import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { removeClosedProposalKeys } from './remove-closed-proposal-keys';
import type { MemoryTables, StoreParts } from './types';

// Lapses every pending proposal past its lapse time in one transaction, and returns how many. A
// lapsed proposal for a new item held that item's only key, so the key goes after the commit, with
// any key an earlier close left behind.
export async function runProposalLapses(parts: StoreParts): Promise<number> {
  const log = parts.context.log;

  const due = await withWriteTransaction(log.writer, async (tx) => {
    const rows = await tx
      .$extendTables<MemoryTables>()
      .selectFrom('memory_proposals')
      .select(['proposal_id', 'thread'])
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

  await removeClosedProposalKeys(parts);

  return due.length;
}

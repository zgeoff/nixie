import type { Transaction } from 'kysely';
import { readPurgeSet } from '../record/read-purge-set';
import type { MemoryContext, MemoryTables } from '../types';
import { writeEvidencePurgeStarted } from './write-evidence-purge-started';

// Fixes the purge set of a record forget: each item whose evidence quotes the record. Call it in the
// transaction that writes record.forget_started, so a crash leaves both records or neither. An empty
// set needs no record, because a second call finds the same empty set.
export async function writeRecordPurgeSet(
  tx: Transaction<unknown>,
  context: Pick<MemoryContext, 'log' | 'definitions'>,
  recordSequence: number,
): Promise<void> {
  const started = await tx
    .$extendTables<MemoryTables>()
    .selectFrom('memory_evidence_purges')
    .select('purge_key')
    .where('record_sequence', '=', recordSequence)
    .executeTakeFirst();

  if (started !== undefined) {
    return;
  }

  const itemIDs = await readPurgeSet(tx, recordSequence);

  if (itemIDs.length === 0) {
    return;
  }

  await writeEvidencePurgeStarted(tx, context, { recordSequence, itemIDs });
}

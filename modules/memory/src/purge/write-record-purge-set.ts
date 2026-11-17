import type { Transaction } from 'kysely';
import { readPurgeSet } from '../record/read-purge-set';
import type { MemoryContext, MemoryTables } from '../types';
import { writeEvidencePurgeStarted } from './write-evidence-purge-started';

// Call it in the transaction that writes record.forget_started, so a crash leaves both or neither.
// A forgetting item stays in the set, so record.forgotten waits for that forget's key delete.
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

  const itemIDs = await readPurgeSet(tx, recordSequence, ['active', 'retired', 'forgetting']);

  if (itemIDs.length === 0) {
    return;
  }

  await writeEvidencePurgeStarted(tx, context, { recordSequence, itemIDs });
}

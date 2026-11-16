import { readAllRemovedSequences } from '../record/read-all-removed-sequences';
import type { MemoryTables, PurgeRequest, PurgeScope, StoreParts } from '../types';
import { runItemPurge } from './run-item-purge';

// Finishes every item of the scope that still owes a purge. A record forget calls it for its own
// record. The server start calls it for the purges that no record forget owns, such as a scrub.
export async function runEvidencePurges(parts: StoreParts, scope: PurgeScope): Promise<void> {
  const owed = await readOwedPurges(parts, scope);

  for (const purge of owed) {
    await runItemPurge(parts, purge);
  }
}

async function readOwedPurges(
  parts: StoreParts,
  scope: PurgeScope,
): Promise<readonly PurgeRequest[]> {
  const db = parts.context.log.writer.db;

  const rows = await db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_evidence_purges')
    .select(['record_sequence', 'item_id'])
    .where('purged_sequence', 'is', null)
    .orderBy('record_sequence')
    .orderBy('item_id')
    .execute();

  const owed = rows.map((row) => ({ recordSequence: row.record_sequence, itemID: row.item_id }));

  if ('recordSequence' in scope) {
    return owed.filter((purge) => purge.recordSequence === scope.recordSequence);
  }

  const owners = await readAllRemovedSequences(db);

  return owed.filter((purge) => !owners.has(purge.recordSequence));
}

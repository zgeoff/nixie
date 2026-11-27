import type { ErasureHandle, LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readAllRemovedSequences } from '../record/read-all-removed-sequences';
import { recordForgottenCodec } from '../record/record-forgotten-codec';
import type {
  ItemErasureRequest,
  MemoryTables,
  PurgeRequest,
  PurgeScope,
  StoreParts,
} from '../types';
import { runItemPurge } from './run-item-purge';

// Finishes every item of the scope that still owes a purge. A record forget calls it for its own
// record. The server start calls it for the purges that no open record forget owns.
export async function runEvidencePurges(
  parts: StoreParts,
  erasure: ErasureHandle<ItemErasureRequest>,
  scope: PurgeScope,
): Promise<void> {
  const owed = await readOwedPurges(parts, scope);

  for (const purge of owed) {
    await runItemPurge(parts, erasure, purge);
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

  const owners = await readOpenForgetSequences(db);

  return owed.filter((purge) => !owners.has(purge.recordSequence));
}

const endedRowSchema = z.object({ record_sequence: z.int() });

// The record forgets with no record.forgotten yet. A forget that ended leaves no later step to finish
// a purge it owed, as when a previous release skipped an item whose own forget had begun.
async function readOpenForgetSequences(db: Kysely<unknown>): Promise<ReadonlySet<number>> {
  const [started, forgotten] = await Promise.all([
    readAllRemovedSequences(db),
    db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select(sql`json_extract(payload, '$.recordSequence')`.as('record_sequence'))
      .where('kind', '=', sql.lit(recordForgottenCodec.kind))
      .execute(),
  ]);

  const ended = new Set(forgotten.map((row) => endedRowSchema.parse(row).record_sequence));

  return new Set([...started].filter((sequence) => !ended.has(sequence)));
}

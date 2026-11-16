import type { Kysely } from 'kysely';
import type { MemoryTables } from '../types';

export interface PurgeRow {
  readonly record_sequence: number;
  readonly item_id: string;
  readonly closed_sequence: number | null;
  readonly purged_sequence: number | null;
}

// The purge projection of the memory module, read the way its own tests do.
export function readPurgeRows(db: Kysely<unknown>): Promise<readonly PurgeRow[]> {
  return db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_evidence_purges')
    .select(['record_sequence', 'item_id', 'closed_sequence', 'purged_sequence'])
    .orderBy('record_sequence')
    .orderBy('item_id')
    .execute();
}

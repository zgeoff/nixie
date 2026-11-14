import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface RecordRowSeed {
  readonly sequence: number;
  readonly kind: string;
}

export async function seedRecordRow(
  db: Kysely<unknown>,
  input: Partial<RecordRowSeed> = {},
): Promise<RecordRowSeed> {
  const row = { sequence: 1, kind: 'memory.version_added', ...input };

  // The db lib sits below every module, so it cannot call the module that writes records: its
  // storage tests seed the row as the schema shapes it.
  await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
    values (${row.sequence}, 1767225600000, ${row.kind}, 'snapshot-a', '{}')`.execute(db);

  return row;
}

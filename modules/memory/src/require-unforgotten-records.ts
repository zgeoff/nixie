import type { LogTables } from '@heynixie/log';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { ForgottenEvidenceError } from './forgotten-evidence-error';

// Refuses a write once a forget of any of the records has started. It runs inside the write's
// transaction, so a forget that commits before the key goes still stops the write.
export async function requireUnforgottenRecords(
  db: Kysely<unknown>,
  sequences: readonly number[],
): Promise<void> {
  const row = await db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select(sql<number>`json_extract(payload, '$.recordSequence')`.as('record_sequence'))
    .where('kind', 'in', ['record.forget_started', 'record.forgotten'])
    .where(sql<number>`json_extract(payload, '$.recordSequence')`, 'in', sequences)
    .limit(1)
    .executeTakeFirst();

  if (row !== undefined) {
    throw new ForgottenEvidenceError(row.record_sequence);
  }
}

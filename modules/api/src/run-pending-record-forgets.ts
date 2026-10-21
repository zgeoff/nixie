import { sql } from 'kysely';
import { z } from 'zod';
import { runRecordForgetCleanup } from './run-record-forget-cleanup';
import type { APIContext, APITables } from './types';

// Finishes every record forget that began and never committed record.forgotten, oldest first, such
// as one a crash cut short or one that ran before the conversation started. The start sequence runs
// it once the session cleanup is in place and before any runner claims work.
export async function runPendingRecordForgets(context: APIContext): Promise<void> {
  const rows = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['kind', sql`json_extract(payload, '$.recordSequence')`.as('record_sequence')])
    .where('kind', 'in', ['record.forget_started', 'record.forgotten'])
    .orderBy('sequence')
    .execute();

  const forgotten = new Set(
    rows.filter((row) => row.kind === 'record.forgotten').map((row) => row.record_sequence),
  );

  const pending = new Set(
    rows
      .filter((row) => row.kind === 'record.forget_started')
      .map((row) => z.number().parse(row.record_sequence))
      .filter((sequence) => !forgotten.has(sequence)),
  );

  for (const sequence of pending) {
    await runRecordForgetCleanup(context, sequence);
  }
}

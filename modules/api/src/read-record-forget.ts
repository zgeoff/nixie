import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { APITables } from './types';

interface RecordForgetQuery {
  readonly kind: 'record.forget_started' | 'record.forgotten';

  readonly sequence: number;
}

export interface RecordForget {
  readonly sequence: number;
  readonly recordedAt: number;
}

export async function readRecordForget(
  db: Kysely<unknown>,
  query: RecordForgetQuery,
): Promise<RecordForget | null> {
  const row = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['sequence', 'recorded_at'])
    .where('kind', '=', query.kind)
    .where(sql`json_extract(payload, '$.recordSequence')`, '=', query.sequence)
    .orderBy('sequence')
    .executeTakeFirst();

  return row === undefined ? null : { sequence: row.sequence, recordedAt: row.recorded_at };
}

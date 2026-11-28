import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { APITables } from '../types';

interface RecordForgetQuery {
  readonly kind: 'record.forget_started' | 'record.forgotten';

  readonly sequence: number;
}

export interface RecordForget {
  readonly sequence: number;
  readonly recordedAt: number;
}

// The first record that begins or ends the forget of the record: the old record of the kind, or the
// erasure.started or erasure.finished of the record kind that replaced it.
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

  const erasureKind =
    query.kind === 'record.forget_started' ? 'erasure.started' : 'erasure.finished';

  const erasure = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select(['sequence', 'recorded_at'])
    .where('kind', '=', sql.lit(erasureKind))
    .where(sql`json_extract(payload, '$.targetID')`, '=', String(query.sequence))
    .where(sql`json_extract(payload, '$.kind')`, '=', 'record')
    .orderBy('sequence')
    .executeTakeFirst();

  const [first] = [row, erasure]
    .filter((found) => found !== undefined)
    .toSorted((left, right) => left.sequence - right.sequence);

  return first === undefined ? null : { sequence: first.sequence, recordedAt: first.recorded_at };
}

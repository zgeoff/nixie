import type { ErasureBy, RecordRow } from '@heynixie/log';
import type { ExpressionBuilder } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import type { APIContext, APITables } from '../../types';
import type { RecordErasureRequest } from './build-record-erasable';

const rowSchema = z.object({ record_sequence: z.int() });

// The record forgets that an earlier release began and never ended, with no erasure.started to
// finish them, oldest first.
export async function readLegacyOpenRecordForgets(
  context: Pick<APIContext, 'log'>,
): Promise<readonly { request: RecordErasureRequest; by: ErasureBy }[]> {
  const rows = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records as begun')
    .select(sql`json_extract(begun.payload, '$.recordSequence')`.as('record_sequence'))
    .where('begun.kind', '=', 'record.forget_started')
    .where((eb) => eb.not(eb.exists(buildEndedQuery(eb))))
    .where((eb) => eb.not(eb.exists(buildErasureQuery(eb))))
    .orderBy('begun.sequence')
    .execute();

  const sequences = [...new Set(rows.map((row) => rowSchema.parse(row).record_sequence))];

  return sequences.map((sequence) => ({
    request: { sequence, thread: null, isResuming: true },
    by: 'user',
  }));
}

type BegunBuilder = ExpressionBuilder<APITables & { begun: RecordRow }, 'begun'>;

function buildEndedQuery(eb: BegunBuilder) {
  return eb
    .selectFrom('records as ended')
    .select('ended.sequence')
    .where('ended.kind', '=', 'record.forgotten')
    .where(
      sql`json_extract(ended.payload, '$.recordSequence')`,
      '=',
      sql`json_extract(begun.payload, '$.recordSequence')`,
    );
}

function buildErasureQuery(eb: BegunBuilder) {
  return eb
    .selectFrom('records as erasure')
    .select('erasure.sequence')
    .where('erasure.kind', '=', sql.lit('erasure.started'))
    .where(
      sql`json_extract(erasure.payload, '$.targetID')`,
      '=',
      sql`cast(json_extract(begun.payload, '$.recordSequence') as text)`,
    )
    .where(sql`json_extract(erasure.payload, '$.kind')`, '=', 'record');
}

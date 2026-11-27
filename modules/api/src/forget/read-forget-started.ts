import { readRecords } from '@heynixie/log';
import { recordForgetStartedCodec } from '@heynixie/memory';
import { sql } from 'kysely';
import type { APIContext, APITables } from '../types';

export type ForgetStarted = NonNullable<
  ReturnType<typeof recordForgetStartedCodec.tryDecodePartial>
>;

// The payload of the first start record of a record's forget, or null before the forget starts. It
// keeps what the forget found while its target was still readable, so a rerun after a crash
// destroys the same keys.
export async function readForgetStarted(
  context: Pick<APIContext, 'log'>,
  recordSequence: number,
): Promise<ForgetStarted | null> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', recordForgetStartedCodec.kind)
    .where(sql`json_extract(payload, '$.recordSequence')`, '=', recordSequence)
    .orderBy('sequence')
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const [entry] = await readRecords(context.log, {
    afterSequence: row.sequence - 1,
    sequences: [row.sequence],
    limit: 1,
  });

  return entry === undefined
    ? null
    : recordForgetStartedCodec.tryDecodePartial(entry.record.payload);
}

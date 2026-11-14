import { readRecords } from '@heynixie/log';
import { recordForgetStartedCodec } from '@heynixie/memory';
import { sql } from 'kysely';
import type { APIContext, APITables } from './types';

// The start record of a brief's forget keeps the starter's task.start calls that hold the brief, so
// a rerun after a crash destroys the same keys once the brief is no longer readable.
export async function readForgetStartCalls(
  context: Pick<APIContext, 'log'>,
  recordSequence: number,
): Promise<readonly number[]> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('kind', '=', recordForgetStartedCodec.kind)
    .where(sql`json_extract(payload, '$.recordSequence')`, '=', recordSequence)
    .orderBy('sequence')
    .executeTakeFirst();

  if (row === undefined) {
    return [];
  }

  const [entry] = await readRecords(context.log, {
    afterSequence: row.sequence - 1,
    sequences: [row.sequence],
    limit: 1,
  });

  const started =
    entry === undefined ? null : recordForgetStartedCodec.tryDecodePartial(entry.record.payload);

  return started?.startCallSequences ?? [];
}

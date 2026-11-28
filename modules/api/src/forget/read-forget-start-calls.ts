import { erasureStartedCodec, parseJSONObject } from '@heynixie/log';
import { sql } from 'kysely';
import type { APIContext, APITables } from '../types';
import { readForgetStarted } from './read-forget-started';

// The erasure of a brief keeps the starter's task.start calls that hold the brief, so a rerun after
// a crash destroys the same keys once the brief is no longer readable. A forget that an earlier
// release began keeps them in its own start record.
export async function readForgetStartCalls(
  context: Pick<APIContext, 'log'>,
  recordSequence: number,
): Promise<readonly number[]> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', sql.lit('erasure.started'))
    .where(sql`json_extract(payload, '$.targetID')`, '=', String(recordSequence))
    .where(sql`json_extract(payload, '$.kind')`, '=', 'record')
    .orderBy('sequence')
    .executeTakeFirst();

  if (row !== undefined) {
    const cause = erasureStartedCodec.decode(parseJSONObject(row.payload)).capture.sessionCause;

    return 'callSequences' in cause ? (cause.callSequences ?? []) : [];
  }

  const started = await readForgetStarted(context, recordSequence);

  return started?.startCallSequences ?? [];
}

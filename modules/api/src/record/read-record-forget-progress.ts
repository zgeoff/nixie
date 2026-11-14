import { readForgetStartCalls } from '../forget/read-forget-start-calls';
import type { APIContext, APITables, ForgetProgress } from '../types';
import { readRecordForget } from '../utils/read-record-forget';

// A forget that removed no key leaves nothing for a backup set to have kept.
export async function readRecordForgetProgress(
  context: APIContext,
  recordSequence: number,
): Promise<ForgetProgress> {
  const db = context.log.writer.db;

  const forgotten = await readRecordForget(db, {
    kind: 'record.forgotten',
    sequence: recordSequence,
  });

  if (forgotten === null) {
    return { stage: 'deleting' };
  }

  const startCalls = await readForgetStartCalls(context, recordSequence);

  const keyed = await db
    .$extendTables<APITables>()
    .selectFrom('records')
    .select('sequence')
    .where('sequence', 'in', [recordSequence, ...startCalls])
    .where('key_id', 'is not', null)
    .executeTakeFirst();

  return { stage: 'forgotten', sequence: keyed === undefined ? null : forgotten.sequence };
}

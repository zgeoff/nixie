import { parseJSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { isWakingRecord } from './is-waking-record';
import type { TasksTables } from './types';

export async function probeWakingInputSince(
  tx: Transaction<unknown>,
  taskID: string,
  afterSequence: number,
): Promise<boolean> {
  const records = await tx
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select(['kind', 'thread', 'payload'])
    .where('thread', '=', taskID)
    .where('sequence', '>', afterSequence)
    .execute();

  return records.some((record) =>
    isWakingRecord({ ...record, payload: parseJSONObject(record.payload) }),
  );
}

import { readPause } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { TasksTables } from './types';

export async function probeTaskPaused(tx: Transaction<unknown>, taskID: string): Promise<boolean> {
  const pause = await readPause(tx);

  if (pause === null) {
    return false;
  }

  const exempt = await tx
    .$extendTables<TasksTables>()
    .selectFrom('pause_exemptions')
    .select('task_id')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  return exempt === undefined;
}

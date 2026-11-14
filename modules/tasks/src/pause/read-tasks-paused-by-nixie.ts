import { readPauseSince } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';

// The tasks among taskIDs that nixie's pause stops: all of them while nixie is paused, less each
// one that a resume of its own exempts.
export async function readTasksPausedByNixie(
  db: Kysely<unknown>,
  taskIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  const pause = await readPauseSince(db);

  if (pause === null || taskIDs.length === 0) {
    return new Set();
  }

  const exempt = await db
    .$extendTables<TasksTables>()
    .selectFrom('pause_exemptions')
    .select('task_id')
    .where('task_id', 'in', [...taskIDs])
    .execute();

  const exemptIDs = new Set(exempt.map((row) => row.task_id));

  return new Set(taskIDs.filter((taskID) => !exemptIDs.has(taskID)));
}

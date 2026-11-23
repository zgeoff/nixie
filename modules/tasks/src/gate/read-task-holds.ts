import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { TaskHolds } from '../types';
import { buildHoldChecks } from './build-hold-checks';

// The holds on a task, from one query, so they agree with each other. A task with no row has no
// task hold: only nixie's pause and the spending stop reach it.
export async function readTaskHolds(db: Kysely<unknown>, taskID: string): Promise<TaskHolds> {
  const checks = buildHoldChecks(sql`${taskID}`);

  const row = await db
    .selectNoFrom([
      checks.ended.as('ended'),
      checks.spend.as('spend'),
      checks.nixie.as('nixie'),
      checks.limit.as('limit'),
      checks.task.as('task'),
    ])
    .executeTakeFirstOrThrow();

  return {
    ended: Boolean(row.ended),
    spend: Boolean(row.spend),
    nixie: Boolean(row.nixie),
    limit: Boolean(row.limit),
    task: Boolean(row.task),
  };
}

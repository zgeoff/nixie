import type { Kysely } from 'kysely';
import type { TasksTables } from '../types';
import { toRunEndCause } from './run-end-cause';
import type { TaskRun } from './types';

const carriedCauses = new Set(['limit', 'stopped', 'failed']);

// The newest raise or restart that is newer than the end of the newest task run, when that task run
// ended with a cause that a raise or a restart continues.
export async function readCarryingControl(
  db: Kysely<unknown>,
  taskID: string,
  newest: TaskRun | null,
): Promise<{ readonly kind: 'raise' | 'restart'; readonly sequence: number } | null> {
  const ended = newest?.ended ?? null;

  if (ended === null || !carriedCauses.has(toRunEndCause(ended.record.cause))) {
    return null;
  }

  const control = await db
    .$extendTables<TasksTables>()
    .selectFrom('records')
    .select(['sequence', 'kind'])
    .where('thread', '=', taskID)
    .where('kind', 'in', ['task.limits_raised', 'task.restarted'])
    .where('sequence', '>', ended.sequence)
    .orderBy('sequence', 'desc')
    .limit(1)
    .executeTakeFirst();

  return control === undefined
    ? null
    : {
        kind: control.kind === 'task.limits_raised' ? 'raise' : 'restart',
        sequence: control.sequence,
      };
}

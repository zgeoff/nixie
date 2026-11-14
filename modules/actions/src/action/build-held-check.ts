import type { TaskState } from '@heynixie/tasks';
import type { ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { sql } from 'kysely';

// An action with a started attempt runs to its outcome whatever its task's state, so only an action
// that never started waits for its task.
const heldTaskStates: readonly TaskState[] = ['paused', 'closed'];

export function buildHeldCheck<Tables, Table extends keyof Tables>(
  eb: ExpressionBuilder<Tables, Table>,
): ExpressionWrapper<Tables, Table, SqlBool> {
  return eb.and([
    eb(sql.ref('actions.attempt_count'), '=', 0),
    eb(sql.ref('tasks.state'), 'in', heldTaskStates),
  ]);
}

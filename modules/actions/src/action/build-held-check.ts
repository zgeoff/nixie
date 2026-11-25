import type { TaskState } from '@heynixie/tasks';
import type { ExpressionBuilder, ExpressionWrapper, SqlBool } from 'kysely';
import { sql } from 'kysely';

// An action with a started attempt runs to its outcome whatever its task's state, so only an action
// that never started waits for its task.
const heldTaskStates: readonly TaskState[] = ['paused', 'closed'];

// A runner's end hook queues its actions under a step key that starts with `ended:`, after the
// task has ended, so a later pause or close of that task never holds them.
const endedStepKeyPattern = 'ended:%';

export function buildHeldCheck<Tables, Table extends keyof Tables>(
  eb: ExpressionBuilder<Tables, Table>,
): ExpressionWrapper<Tables, Table, SqlBool> {
  return eb.and([
    eb(sql.ref('actions.attempt_count'), '=', 0),
    eb(sql.ref('tasks.state'), 'in', heldTaskStates),
    eb(sql.ref('actions.step_key'), 'not like', endedStepKeyPattern),
  ]);
}

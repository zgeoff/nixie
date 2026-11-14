import type { Transaction } from 'kysely';
import type { ActionsTables } from '../types';

// One task ID for each action with no outcome, so an ID repeats once per action. An action that a
// stop cancelled never started an attempt, and it leaves out.
export async function readTasksWithPendingActions(
  tx: Transaction<unknown>,
): Promise<readonly string[]> {
  const rows = await tx
    .$extendTables<ActionsTables>()
    .selectFrom('actions')
    .select('task_id')
    .where('outcome_sequence', 'is', null)
    .where('cancelled_sequence', 'is', null)
    .orderBy('queued_sequence')
    .execute();

  return rows.map((row) => row.task_id);
}

import { isFinishedState } from '@heynixie/tasks';
import type { TasksTables } from '@heynixie/tasks';
import type { Transaction } from 'kysely';
import type { TriggersTables } from '../types';
import { endWakeRuleInTransaction } from './end-wake-rule-in-transaction';
import type { WakeRuleContext } from './set-wake-rule-in-transaction';

// Ends each live rule of each named task that has ended, as task_ended, and returns the IDs of
// those tasks.
export async function endRulesOfEndedTasks(
  tx: Transaction<unknown>,
  context: WakeRuleContext,
  taskIDs: readonly string[],
): Promise<ReadonlySet<string>> {
  if (taskIDs.length === 0) {
    return new Set();
  }

  const tasks = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state'])
    .where('task_id', 'in', [...taskIDs])
    .execute();

  const ended = tasks.filter((task) => isFinishedState(task.state)).map((task) => task.task_id);

  if (ended.length === 0) {
    return new Set();
  }

  const rules = await tx
    .$extendTables<TriggersTables>()
    .selectFrom('wake_rules')
    .select('rule_id')
    .where('target_task_id', 'in', ended)
    .where('ended_at', 'is', null)
    .execute();

  for (const rule of rules) {
    await endWakeRuleInTransaction(tx, context, rule.rule_id, 'task_ended');
  }

  return new Set(ended);
}

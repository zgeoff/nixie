import { isFinishedState } from '@heynixie/tasks';
import type { TasksTables } from '@heynixie/tasks';
import type { Kysely, Transaction } from 'kysely';
import type { Mailbox, WakeRule } from '../types';
import { readLiveWakeRules } from './read-live-wake-rules';

export interface ReadWakeRulesOptions {
  readonly mailbox: Mailbox;

  // epoch ms: a rule that expired by then is left out
  readonly at: number;
}

// The rules of the mailbox that are not expired or ended and whose target task has not ended,
// newest first. Every list tool shows every one of them, whoever set it.
export async function readWakeRules(
  db: Kysely<unknown> | Transaction<unknown>,
  options: ReadWakeRulesOptions,
): Promise<readonly WakeRule[]> {
  const live = await readLiveWakeRules(db, options.mailbox);

  const rules = live
    .map((entry) => entry.rule)
    .filter((rule) => rule.expiresAt === null || rule.expiresAt > options.at);

  const taskIDs = rules.flatMap((rule) =>
    rule.target.kind === 'task' ? [rule.target.taskID] : [],
  );

  if (taskIDs.length === 0) {
    return rules;
  }

  const tasks = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state'])
    .where('task_id', 'in', taskIDs)
    .execute();

  const ended = new Set(
    tasks.filter((task) => isFinishedState(task.state)).map((task) => task.task_id),
  );

  return rules.filter((rule) => rule.target.kind !== 'task' || !ended.has(rule.target.taskID));
}

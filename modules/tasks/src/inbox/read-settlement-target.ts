import { isFinishedState } from '@heynixie/task-control';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import type { TasksTables } from '../types';

export interface SettlementTarget {
  readonly thread: string;

  // the proposing task's name, when it had closed and the settlement went to its starter
  readonly task: string | null;
}

const createdSchema = z.object({ name: z.string() });

// Where a settlement for a proposer's thread goes. A task that has closed takes no input, so its
// settlement goes to the thread of its starter, with the task's name. A task with no starter keeps
// the settlement on its own thread, where it wakes nothing.
export async function readSettlementTarget(
  tx: Transaction<unknown>,
  thread: string,
): Promise<SettlementTarget> {
  const task = await tx
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.created_sequence')
    .select(['tasks.state', 'tasks.started_by', 'records.payload'])
    .where('tasks.task_id', '=', thread)
    .executeTakeFirst();

  if (task === undefined || !isFinishedState(task.state) || task.started_by === null) {
    return { thread, task: null };
  }

  const created = createdSchema.safeParse(JSON.parse(task.payload));

  return { thread: task.started_by, task: created.success ? created.data.name : thread };
}

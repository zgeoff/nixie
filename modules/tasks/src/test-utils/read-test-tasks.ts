import type { TaskState, TasksContext, TasksTables } from '../types';

export interface TestTask {
  readonly id: string;
  readonly state: TaskState;
  readonly lastInboxSequence: number;
  readonly createdSequence: number;
}

export async function readTestTasks(
  context: Pick<TasksContext, 'log'>,
): Promise<readonly TestTask[]> {
  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state', 'last_inbox_sequence', 'created_sequence'])
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => ({
    id: row.task_id,
    state: row.state,
    lastInboxSequence: row.last_inbox_sequence,
    createdSequence: row.created_sequence,
  }));
}

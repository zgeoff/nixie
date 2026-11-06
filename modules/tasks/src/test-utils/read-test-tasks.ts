import type { Writer } from '@heynixie/log';
import type { TaskState, TasksTables } from '../types';

export interface TestTask {
  readonly id: string;
  readonly state: TaskState;
  readonly readCursor: number;
  readonly lastInboxSequence: number;
  readonly createdSequence: number;
}

export async function readTestTasks(writer: Pick<Writer, 'db'>): Promise<readonly TestTask[]> {
  const rows = await writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['task_id', 'state', 'read_cursor', 'last_inbox_sequence', 'created_sequence'])
    .orderBy('created_sequence')
    .execute();

  return rows.map((row) => ({
    id: row.task_id,
    state: row.state,
    readCursor: row.read_cursor,
    lastInboxSequence: row.last_inbox_sequence,
    createdSequence: row.created_sequence,
  }));
}

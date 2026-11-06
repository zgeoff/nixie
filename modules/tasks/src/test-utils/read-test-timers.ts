import type { Writer } from '@heynixie/log';
import type { TasksTables } from '../types';

export interface TestTimer {
  readonly taskID: string;
  readonly dueAt: number;
  readonly firedAt: number | null;
}

export async function readTestTimers(writer: Pick<Writer, 'db'>): Promise<readonly TestTimer[]> {
  const rows = await writer.db
    .$extendTables<TasksTables>()
    .selectFrom('timers')
    .select(['task_id', 'due_at', 'fired_at'])
    .orderBy('set_sequence')
    .execute();

  return rows.map((row) => ({ taskID: row.task_id, dueAt: row.due_at, firedAt: row.fired_at }));
}

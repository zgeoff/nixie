import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TaskState, TasksTables } from '@heynixie/tasks';
import type { CodingOptions } from '../start/coding-options-schema';
import { codingOptionsSchema } from '../start/coding-options-schema';

export interface CodingTask {
  readonly taskID: string;
  readonly state: TaskState;

  // the task that started the coding task: its report target
  readonly reportTarget: string;
  readonly options: CodingOptions;
}

// A coding task as its runner reads it, or null for a task that is no coding task of the adapter.
export async function readCodingTask(
  log: Log,
  adapterID: string,
  taskID: string,
): Promise<CodingTask | null> {
  const row = await log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['state', 'started_by', 'created_sequence'])
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined || row.started_by === null) {
    return null;
  }

  const [created] = await readRecords(log, {
    afterSequence: 0,
    sequences: [row.created_sequence],
  });

  const payload = created?.record.payload;
  const options = codingOptionsSchema.safeParse(payload?.['runnerOptions']);

  if (payload?.['runner'] !== adapterID || !options.success) {
    return null;
  }

  return { taskID, state: row.state, reportTarget: row.started_by, options: options.data };
}

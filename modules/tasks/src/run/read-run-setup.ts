import { parseJSONObject } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { ReportShape } from '../report/types';
import { taskCreatedCodec } from '../task/codec/task-created-codec';
import type { TaskLimits, TaskReport, TasksTables } from '../types';

export interface RunSetup {
  readonly startedBy: string;
  readonly report: TaskReport;
  readonly limits: TaskLimits;

  // a runner that keeps its own options declares no report shape
  readonly reportShape: ReportShape | null;
}

// A task that has neither options nor an envelope, or whose starter is gone from its row, has no
// setup: nixie opens no task run for it.
export async function readRunSetup(
  tx: Transaction<unknown>,
  taskID: string,
): Promise<RunSetup | null> {
  const db = tx.$extendTables<TasksTables>();

  const task = await db
    .selectFrom('tasks')
    .innerJoin('records', 'records.sequence', 'tasks.created_sequence')
    .select(['tasks.started_by', 'records.payload'])
    .where('tasks.task_id', '=', taskID)
    .executeTakeFirst();

  if (task === undefined || task.started_by === null) {
    return null;
  }

  const created = taskCreatedCodec.decode(parseJSONObject(task.payload));
  const source = created.options ?? created.envelope;

  return source === undefined
    ? null
    : {
        startedBy: task.started_by,
        report: source.report,
        limits: source.limits,
        reportShape: created.options?.reportShape ?? null,
      };
}

import { readRecords } from '@heynixie/log';
import { readLimitRecords } from '../limit/read-limit-records';
import type { TaskLimits, TaskReport, TaskRunOptions, TasksContext, TasksTables } from '../types';
import { taskCreatedCodec } from './codec/task-created-codec';

// report, limits and options are null for a task that the user started by moving a message to it.
// options is also null for a task that another runner started, which keeps its own in
// runnerOptions.
export interface StartedTaskSetup {
  readonly kind: 'started';
  readonly runner: string;
  readonly startedBy: string;
  readonly report: TaskReport | null;
  readonly limits: TaskLimits | null;
  readonly options: TaskRunOptions | null;
}

// A definition's task holds the hash in force, or null while the definition is out of force. Its
// options come from a version, which each task run pins.
export interface DefinitionTaskSetup {
  readonly kind: 'definition';
  readonly definitionID: string;
  readonly definitionHash: string | null;
}

export type TaskSetup = StartedTaskSetup | DefinitionTaskSetup | { readonly kind: 'fixed' };

export async function readTaskSetup(
  context: Pick<TasksContext, 'log' | 'runners'>,
  taskID: string,
): Promise<TaskSetup | null> {
  const db = context.log.writer.db;

  const row = await db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select(['started_by', 'created_sequence', 'definition_id', 'definition_hash'])
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  if (row.definition_id !== null) {
    return {
      kind: 'definition',
      definitionID: row.definition_id,
      definitionHash: row.definition_hash,
    };
  }

  if (row.started_by === null) {
    return { kind: 'fixed' };
  }

  const [created] = await readRecords(context.log, {
    afterSequence: 0,
    sequences: [row.created_sequence],
  });

  const payload = created === undefined ? null : taskCreatedCodec.decode(created.record.payload);
  const options = payload?.options ?? null;
  const envelope = payload?.envelope ?? null;

  const limitRecords = await readLimitRecords(db, taskID);

  return {
    kind: 'started',
    runner: payload?.runner ?? context.runners.defaultRunner.key,
    startedBy: row.started_by,
    report: options?.report ?? envelope?.report ?? null,
    limits: limitRecords.raised ?? options?.limits ?? envelope?.limits ?? null,
    options,
  };
}

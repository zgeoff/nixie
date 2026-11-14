import { parseJSONObject } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { TasksTables } from '../types';
import { taskRunEndedCodec } from './task-run-ended-codec';
import { taskRunOpenedCodec } from './task-run-opened-codec';
import type { TaskRun } from './types';

export type TaskRunRow = Selectable<TasksTables['task_runs']>;

export function toTaskRun(row: TaskRunRow): TaskRun {
  const ended =
    row.ended === null || row.ended_sequence === null || row.ended_at === null
      ? null
      : {
          record: taskRunEndedCodec.decode(parseJSONObject(row.ended)),
          sequence: row.ended_sequence,
          endedAt: new Date(row.ended_at),
        };

  return {
    runID: row.run_id,
    taskID: row.task_id,
    openedSequence: row.opened_sequence,
    startedAt: new Date(row.started_at),
    opened: taskRunOpenedCodec.decode(parseJSONObject(row.opened)),
    reportID: row.report_id,
    ended,
  };
}

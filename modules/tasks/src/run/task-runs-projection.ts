import type { Projection } from '@heynixie/log';
import type { TasksTables } from '../types';
import { taskRunEndedCodec } from './task-run-ended-codec';
import { taskRunOpenedCodec } from './task-run-opened-codec';
import { taskRunReportRequestedCodec } from './task-run-report-requested-codec';

// Folds the 3 task run records and no other, so a rebuild gives the same rows.
export const taskRunsProjection: Projection = {
  table: 'task_runs',
  keyColumn: 'run_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<TasksTables>();

    if (record.kind === taskRunOpenedCodec.kind) {
      const opened = taskRunOpenedCodec.decode(record.payload);

      await db
        .insertInto('task_runs')
        .values({
          run_id: opened.runID,
          task_id: opened.taskID,
          opened_sequence: record.sequence,
          started_at: record.recordedAt.getTime(),
          definition_id: opened.definitionID,
          opened: JSON.stringify(record.payload),
          report_id: null,
          ended_sequence: null,
          ended_at: null,
          ended: null,
        })
        .execute();

      return [opened.runID];
    }

    if (record.kind === taskRunReportRequestedCodec.kind) {
      const requested = taskRunReportRequestedCodec.decode(record.payload);

      await db
        .updateTable('task_runs')
        .set({ report_id: requested.reportID })
        .where('run_id', '=', requested.runID)
        .execute();

      return [requested.runID];
    }

    if (record.kind === taskRunEndedCodec.kind) {
      const ended = taskRunEndedCodec.decode(record.payload);

      await db
        .updateTable('task_runs')
        .set({
          ended_sequence: record.sequence,
          ended_at: record.recordedAt.getTime(),
          ended: JSON.stringify(record.payload),
        })
        .where('run_id', '=', ended.runID)
        .execute();

      return [ended.runID];
    }

    return [];
  },
};

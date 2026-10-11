import type { Projection } from '@heynixie/log';
import { parseTaskRecord } from './parse-task-record';
import type { TasksTables } from './types';

// One row per durable timer: a step commit sets it with its due time, and its fire record stores
// when it fired. A timer row with no fire time is still pending, whatever the clock says.
export const timersProjection: Projection = {
  table: 'timers',
  keyColumn: 'timer_id',
  fold: async (tx, record) => {
    const parsed = parseTaskRecord(record);
    const db = tx.$extendTables<TasksTables>();

    if (parsed?.kind === 'task.step_committed' && parsed.timers.length > 0) {
      await db
        .insertInto('timers')
        .values(
          parsed.timers.map((timer) => ({
            timer_id: timer.timerID,
            task_id: parsed.taskID,
            due_at: timer.dueAt,
            set_sequence: record.sequence,
            fired_at: null,
            fired_sequence: null,
          })),
        )
        .execute();
      return parsed.timers.map((timer) => timer.timerID);
    }
    if (parsed?.kind === 'timer.fired') {
      await db
        .updateTable('timers')
        .set({ fired_at: parsed.firedAt, fired_sequence: record.sequence })
        .where('timer_id', '=', parsed.timerID)
        .execute();
      return [parsed.timerID];
    }
    return [];
  },
};

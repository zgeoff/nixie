import type { LogTables, Projection } from '../types';
import { taskExemptedCodec } from '../utils/task-exempted-codec';

export const pauseExemptionsProjection: Projection = {
  table: 'pause_exemptions',
  keyColumn: 'task_id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<LogTables>();

    if (record.kind === 'nixie.paused' || record.kind === 'nixie.resumed') {
      const exempt = await tables.selectFrom('pause_exemptions').select('task_id').execute();

      await tables.deleteFrom('pause_exemptions').execute();

      return exempt.map((row) => row.task_id);
    }

    if (record.kind !== 'nixie.task_exempted') {
      return [];
    }

    const payload = taskExemptedCodec.decode(record.payload);

    await tables
      .insertInto('pause_exemptions')
      .values({ task_id: payload.taskID, exempt_sequence: record.sequence })
      .onConflict((conflict) => conflict.column('task_id').doNothing())
      .execute();

    return [payload.taskID];
  },
};

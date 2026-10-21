import type { LogTables, Projection } from './types';

export const threadsProjection: Projection = {
  table: 'threads',
  keyColumn: 'thread',
  fold: async (tx, record) => {
    if (record.thread === null) {
      return [];
    }

    await tx
      .$extendTables<LogTables>()
      .insertInto('threads')
      .values({
        thread: record.thread,
        first_sequence: record.sequence,
        last_sequence: record.sequence,
        record_count: 1,
        last_recorded_at: record.recordedAt.getTime(),
      })
      .onConflict((conflict) =>
        conflict.column('thread').doUpdateSet((eb) => ({
          last_sequence: eb.ref('excluded.last_sequence'),
          record_count: eb('threads.record_count', '+', 1),
          last_recorded_at: eb.ref('excluded.last_recorded_at'),
        })),
      )
      .execute();

    return [record.thread];
  },
};

import { nixiePausedCodec } from './nixie-paused-codec';
import type { LogTables, Projection } from './types';

const pauseKey = '1';

export const nixiePauseProjection: Projection = {
  table: 'nixie_pause',
  keyColumn: 'id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<LogTables>();

    if (record.kind === 'nixie.resumed') {
      await tables.deleteFrom('nixie_pause').execute();

      return [pauseKey];
    }

    if (record.kind !== 'nixie.paused') {
      return [];
    }

    const payload = nixiePausedCodec.decode(record.payload);

    await tables
      .insertInto('nixie_pause')
      .values({
        id: 1,
        cause: payload.cause,
        recovery_id: payload.recoveryID,
        paused_sequence: record.sequence,
      })
      .onConflict((conflict) =>
        conflict.column('id').doUpdateSet((eb) => ({
          cause: eb.ref('excluded.cause'),
          recovery_id: eb.ref('excluded.recovery_id'),
          paused_sequence: eb.ref('excluded.paused_sequence'),
        })),
      )
      .execute();

    return [pauseKey];
  },
};

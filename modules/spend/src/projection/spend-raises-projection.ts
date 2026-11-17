import type { Projection } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import type { SpendTables } from '../types';

// One row per day that a raise touched. A later raise of the same day replaces the earlier one.
export const spendRaisesProjection: Projection = {
  table: 'spend_raises',
  keyColumn: 'start',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== spendLimitRaisedCodec.kind) {
      return [];
    }

    const payload = spendLimitRaisedCodec.decode(record.payload);

    const values = {
      start: payload.start,
      dollars: payload.dollars,
      tokens: payload.tokens,
      turns: payload.turns,
      raised_by: payload.by,
      at: record.recordedAt.getTime(),
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<SpendTables>()
      .insertInto('spend_raises')
      .values(values)
      .onConflict((conflict) => conflict.column('start').doUpdateSet(values))
      .execute();

    return [payload.start];
  },
};

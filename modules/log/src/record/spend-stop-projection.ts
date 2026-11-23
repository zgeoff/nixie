import { spendStopClearedCodec } from '../pause/spend-stop-cleared-codec';
import { spendStopTrippedCodec } from '../pause/spend-stop-tripped-codec';
import type { LogTables, Projection } from '../types';

const stopKey = '1';

// One row while the stop stands. A trip replaces the row, and a clear removes it.
export const spendStopProjection: Projection = {
  table: 'spend_stop',
  keyColumn: 'id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<LogTables>();

    if (record.kind === spendStopClearedCodec.kind) {
      await tables.deleteFrom('spend_stop').execute();

      return [stopKey];
    }

    if (record.kind !== spendStopTrippedCodec.kind) {
      return [];
    }

    const payload = spendStopTrippedCodec.decode(record.payload);

    const values = {
      id: 1,
      reason: payload.reason,
      period: payload.period ?? null,
      measure: payload.measure ?? null,
      limit_amount: payload.limit ?? null,
      spent_amount: payload.spent ?? null,
      at: payload.at,
      resets_at: payload.resetsAt ?? null,
      updated_sequence: record.sequence,
    };

    await tables
      .insertInto('spend_stop')
      .values(values)
      .onConflict((conflict) => conflict.column('id').doUpdateSet(values))
      .execute();

    return [stopKey];
  },
};

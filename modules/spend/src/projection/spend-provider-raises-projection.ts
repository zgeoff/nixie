import type { Projection } from '@heynixie/log';
import { spendLimitRaisedCodec } from '../record/spend-limit-raised-codec';
import type { SpendTables } from '../types';

// One row per provider, which holds the day of its latest raise of dollars. A raise of the same
// provider on a later day replaces the row, and no limit reads an earlier day's.
export const spendProviderRaisesProjection: Projection = {
  table: 'spend_provider_raises',
  keyColumn: 'provider_id',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== spendLimitRaisedCodec.kind) {
      return [];
    }

    const payload = spendLimitRaisedCodec.decode(record.payload);

    if (payload.provider === undefined || payload.dollars === undefined) {
      return [];
    }

    const values = {
      provider_id: payload.provider,
      start: payload.start,
      dollars: payload.dollars,
      raised_by: payload.by,
      at: record.recordedAt.getTime(),
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<SpendTables>()
      .insertInto('spend_provider_raises')
      .values(values)
      .onConflict((conflict) => conflict.column('provider_id').doUpdateSet(values))
      .execute();

    return [payload.provider];
  },
};

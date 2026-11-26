import { spendProviderClearedCodec } from '../pause/spend-provider-cleared-codec';
import { spendProviderRestatedCodec } from '../pause/spend-provider-restated-codec';
import { spendProviderStoppedCodec } from '../pause/spend-provider-stopped-codec';
import type { LogTables, Projection } from '../types';

// One row for each provider whose stop stands. A trip or a restatement of a provider replaces its
// row and leaves the holds of that provider, and a clear removes the row and the holds.
export const spendProviderStopsProjection: Projection = {
  table: 'spend_provider_stops',
  keyColumn: 'provider_id',
  fold: async (tx, record) => {
    if (record.thread !== null) {
      return [];
    }

    const tables = tx.$extendTables<LogTables>();

    if (record.kind === spendProviderClearedCodec.kind) {
      const payload = spendProviderClearedCodec.decode(record.payload);

      await tables
        .deleteFrom('spend_provider_stops')
        .where('provider_id', '=', payload.provider)
        .execute();

      await tables
        .deleteFrom('spend_provider_holds')
        .where('provider_id', '=', payload.provider)
        .execute();

      return [payload.provider];
    }

    if (
      record.kind !== spendProviderStoppedCodec.kind &&
      record.kind !== spendProviderRestatedCodec.kind
    ) {
      return [];
    }

    const payload =
      record.kind === spendProviderStoppedCodec.kind
        ? spendProviderStoppedCodec.decode(record.payload)
        : spendProviderRestatedCodec.decode(record.payload);

    const values = {
      provider_id: payload.provider,
      period: payload.period,
      limit_amount: payload.limit,
      spent_amount: payload.spent,
      at: payload.at,
      resets_at: payload.resetsAt,
      routes: JSON.stringify(payload.routes),
      updated_sequence: record.sequence,
    };

    await tables
      .insertInto('spend_provider_stops')
      .values(values)
      .onConflict((conflict) => conflict.column('provider_id').doUpdateSet(values))
      .execute();

    return [payload.provider];
  },
};

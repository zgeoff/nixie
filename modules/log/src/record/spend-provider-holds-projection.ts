import { spendProviderHeldCodec } from '../pause/spend-provider-held-codec';
import type { LogTables, Projection } from '../types';

// One row for each task that waits on a stopped provider. The row only holds the task while the
// provider's stop stands.
export const spendProviderHoldsProjection: Projection = {
  table: 'spend_provider_holds',
  keyColumn: 'task_id',
  fold: async (tx, record) => {
    if (record.thread !== null || record.kind !== spendProviderHeldCodec.kind) {
      return [];
    }

    const payload = spendProviderHeldCodec.decode(record.payload);

    const values = {
      task_id: payload.taskID,
      provider_id: payload.provider,
      updated_sequence: record.sequence,
    };

    await tx
      .$extendTables<LogTables>()
      .insertInto('spend_provider_holds')
      .values(values)
      .onConflict((conflict) => conflict.column('task_id').doUpdateSet(values))
      .execute();

    return [payload.taskID];
  },
};

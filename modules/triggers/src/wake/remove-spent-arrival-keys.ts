import type { LogTables } from '@heynixie/log';
import { removeRecordKey, withWriteTransaction } from '@heynixie/log';
import { triggerMailArrivedCodec } from '../record/trigger-mail-arrived-codec';
import type { TriggerCoreContext, TriggersTables } from '../types';

// Deletes the key of each arrival that no held match names. The cleanup row goes only after its key,
// so a crash leaves the arrival for the next call. Returns the number of keys removed.
export async function removeSpentArrivalKeys(
  core: Pick<TriggerCoreContext, 'log'>,
): Promise<number> {
  const db = core.log.writer.db.$extendTables<TriggersTables & LogTables>();

  const spent = await db
    .selectFrom('wake_arrival_cleanup')
    .leftJoin('records', 'records.sequence', 'wake_arrival_cleanup.arrived_seq')
    .select(['wake_arrival_cleanup.arrived_seq', 'records.key_id', 'records.kind'])
    .where((builder) =>
      builder.not(
        builder.exists(
          builder
            .selectFrom('wake_held')
            .select('wake_held.held_key')
            .whereRef('wake_held.arrived_seq', '=', 'wake_arrival_cleanup.arrived_seq'),
        ),
      ),
    )
    .execute();

  for (const arrival of spent) {
    if (arrival.key_id !== null && arrival.kind === triggerMailArrivedCodec.kind) {
      await removeRecordKey(core.log, arrival.key_id);
    }

    await withWriteTransaction(core.log.writer, (tx) =>
      tx
        .$extendTables<TriggersTables>()
        .deleteFrom('wake_arrival_cleanup')
        .where('arrived_seq', '=', arrival.arrived_seq)
        .execute(),
    );
  }

  return spent.length;
}

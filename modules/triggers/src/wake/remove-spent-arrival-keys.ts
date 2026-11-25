import type { LogTables } from '@heynixie/log';
import { removeRecordKey } from '@heynixie/log';
import type { TriggerCoreContext, TriggersTables } from '../types';

// Deletes the key of each arrival that no held match names, so the mail's text lasts in nixie's
// records only in the wakes that showed it. Runs once the transaction that spent them committed.
export async function removeSpentArrivalKeys(
  core: Pick<TriggerCoreContext, 'log'>,
  sequences: readonly number[],
): Promise<void> {
  const db = core.log.writer.db;

  for (const sequence of new Set(sequences)) {
    const held = await db
      .$extendTables<TriggersTables>()
      .selectFrom('wake_held')
      .select('held_key')
      .where('arrived_seq', '=', sequence)
      .executeTakeFirst();

    const record = await db
      .$extendTables<LogTables>()
      .selectFrom('records')
      .select('key_id')
      .where('sequence', '=', sequence)
      .executeTakeFirst();

    if (held === undefined && record?.key_id !== undefined && record.key_id !== null) {
      await removeRecordKey(core.log, record.key_id);
    }
  }
}

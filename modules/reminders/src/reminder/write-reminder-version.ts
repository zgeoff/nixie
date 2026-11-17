import { toCanonicalJSON } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import type { RemindersTables } from '../types';
import type { ReminderVersion } from './build-reminder-hash';

// A version is never rewritten, because its hash covers its content.
export async function writeReminderVersion(
  tx: Transaction<unknown>,
  hash: string,
  version: ReminderVersion,
): Promise<void> {
  await tx
    .$extendTables<RemindersTables>()
    .insertInto('reminder_versions')
    .values({
      reminder_hash: hash,
      name: version.name,
      note: version.note,
      trigger: toCanonicalJSON(version.trigger),
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

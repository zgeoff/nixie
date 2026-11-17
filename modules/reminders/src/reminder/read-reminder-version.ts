import { triggerSchema } from '@heynixie/contract';
import type { Trigger } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import type { RemindersTables } from '../types';

export interface StoredReminderVersion {
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;
}

// The version a reminder hash names, or null when no row holds it. A caller inside a write
// transaction passes it as the handle, so the read does not wait on that transaction.
export async function readReminderVersion(
  db: Kysely<unknown>,
  hash: string,
): Promise<StoredReminderVersion | null> {
  const row = await db
    .$extendTables<RemindersTables>()
    .selectFrom('reminder_versions')
    .select(['name', 'note', 'trigger'])
    .where('reminder_hash', '=', hash)
    .executeTakeFirst();

  return row === undefined
    ? null
    : { name: row.name, note: row.note, trigger: triggerSchema.parse(JSON.parse(row.trigger)) };
}

import { triggerSchema } from '@heynixie/contract';
import type { Trigger } from '@heynixie/contract';
import type { Kysely } from 'kysely';
import type { ReminderState, RemindersTables } from '../types';

export interface FoundReminder {
  readonly reminderID: string;
  readonly shortID: string;
  readonly state: ReminderState;
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;
}

// The reminder a short ID names with the version it holds, or null when none matches.
export async function readReminderByShortID(
  db: Kysely<unknown>,
  shortID: string,
): Promise<FoundReminder | null> {
  const row = await db
    .$extendTables<RemindersTables>()
    .selectFrom('reminders')
    .innerJoin('reminder_versions', 'reminder_versions.reminder_hash', 'reminders.reminder_hash')
    .select([
      'reminders.reminder_id',
      'reminders.short_id',
      'reminders.state',
      'reminder_versions.name',
      'reminder_versions.note',
      'reminders.trigger',
    ])
    .where('reminders.short_id', '=', shortID)
    .executeTakeFirst();

  return row === undefined
    ? null
    : {
        reminderID: row.reminder_id,
        shortID: row.short_id,
        state: row.state,
        name: row.name,
        note: row.note,
        trigger: triggerSchema.parse(JSON.parse(row.trigger)),
      };
}

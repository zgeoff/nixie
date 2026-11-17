import { triggerSchema } from '@heynixie/contract';
import type { Trigger } from '@heynixie/contract';
import { buildReminderTriggerID, readDefinitionNextFire, renderTrigger } from '@heynixie/triggers';
import type { ReadZone } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { ReminderState, RemindersTables } from '../types';

const dayMs = 24 * 60 * 60 * 1000;
const firesSchema = z.array(z.string());

export interface ListedReminder {
  readonly shortID: string;
  readonly name: string;
  readonly note: string;
  readonly trigger: Trigger;

  // the trigger in words
  readonly rendered: string;
  readonly state: ReminderState;

  // ISO in UTC; null when none is left
  readonly next: string | null;
  readonly recentFires: readonly string[];
  readonly setSequence: number;
}

export interface ReminderListOptions {
  // epoch milliseconds
  readonly now: number;
  readonly readZone: ReadZone;

  // the page after the reminder set at this sequence
  readonly beforeSequence?: number | undefined;
}

// The active reminders and the one-offs that fired in the last 24 hours, the newest set first. A
// reminder whose version is gone is left out, because it has no text to show.
export async function readReminderList(
  db: Kysely<unknown>,
  options: ReminderListOptions,
): Promise<readonly ListedReminder[]> {
  const rows = await db
    .$extendTables<RemindersTables>()
    .selectFrom('reminders')
    .innerJoin('reminder_versions', 'reminder_versions.reminder_hash', 'reminders.reminder_hash')
    .select([
      'reminders.reminder_id',
      'reminders.short_id',
      'reminders.state',
      'reminders.trigger',
      'reminders.recent_fires',
      'reminders.set_sequence',
      'reminder_versions.name',
      'reminder_versions.note',
    ])
    .where((eb) =>
      eb.or([
        eb('reminders.state', '=', 'active'),
        eb.and([
          eb('reminders.state', '=', 'fired'),
          eb('reminders.fired_at', '>=', options.now - dayMs),
        ]),
      ]),
    )
    .where('reminders.set_sequence', '<', options.beforeSequence ?? Number.MAX_SAFE_INTEGER)
    .orderBy('reminders.set_sequence', 'desc')
    .execute();

  const listed: ListedReminder[] = [];

  for (const row of rows) {
    const trigger = triggerSchema.parse(JSON.parse(row.trigger));
    const zoneName = 'at' in trigger ? 'owner' : trigger.schedule.zone;

    const zone = await options.readZone(zoneName);

    const triggerID = buildReminderTriggerID(row.reminder_id);

    const next =
      row.state === 'active' ? await readDefinitionNextFire(db, options.readZone, triggerID) : null;

    listed.push({
      shortID: row.short_id,
      name: row.name,
      note: row.note,
      trigger,
      rendered: renderTrigger(trigger, options.now, zone).rendered,
      state: row.state,
      next,
      recentFires: firesSchema.parse(JSON.parse(row.recent_fires)),
      setSequence: row.set_sequence,
    });
  }

  return listed;
}

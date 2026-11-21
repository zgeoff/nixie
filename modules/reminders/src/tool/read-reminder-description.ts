import type { Trigger } from '@heynixie/contract';
import {
  buildReminderTriggerID,
  formatZonedISO,
  readDefinitionNextFires,
  renderTrigger,
} from '@heynixie/triggers';
import type { RemindersContext } from '../types';

export interface DescribedReminder {
  readonly reminderID: string;
  readonly shortID: string;
}

// How many of the next fires a result reads back.
const readBackFires = 3;

// The result of a set, an update, a snooze and a skip: the ID, the schedule in words with its zone,
// and the next 3 fires in local time.
export async function readReminderDescription(
  context: RemindersContext,
  reminder: DescribedReminder,
  trigger: Trigger,
) {
  const zoneName = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await context.readZone(zoneName);

  const upcoming = await readDefinitionNextFires(
    context.log.writer.db,
    context.readZone,
    buildReminderTriggerID(reminder.reminderID),
    readBackFires,
  );

  return {
    reminder: reminder.shortID,
    rendered: renderTrigger(trigger, context.log.writer.clock.now(), zone).rendered,
    next: (upcoming?.fires ?? []).map((fire) => formatZonedISO(fire.atMs, upcoming?.zone ?? zone)),
  };
}

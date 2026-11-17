import type { Trigger } from '@heynixie/contract';
import { buildReminderTriggerID, readDefinitionNextFire, renderTrigger } from '@heynixie/triggers';
import type { RemindersContext } from '../types';

export interface DescribedReminder {
  readonly reminderID: string;
  readonly shortID: string;
}

export async function readReminderDescription(
  context: RemindersContext,
  reminder: DescribedReminder,
  trigger: Trigger,
) {
  const zoneName = 'at' in trigger ? 'owner' : trigger.schedule.zone;

  const zone = await context.readZone(zoneName);

  const next = await readDefinitionNextFire(
    context.log.writer.db,
    context.readZone,
    buildReminderTriggerID(reminder.reminderID),
  );

  return {
    reminder: reminder.shortID,
    rendered: renderTrigger(trigger, context.log.writer.clock.now(), zone).rendered,
    next,
  };
}

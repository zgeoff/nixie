import { readTriggerZone } from '@heynixie/connectors';
import type { LogRecord } from '@heynixie/log';
import { readReminderVersion } from '@heynixie/reminders';
import type { TasksContext } from '@heynixie/tasks';
import { conversationTaskID, parseTriggerFired } from '@heynixie/tasks';
import type { ReminderRead } from './render-reminder-notice';

// What the reminder of a fire needs: its name and note from the version the fire pins, and the zone
// of its set time. Null for any record that is no schedule or at fire on the conversation's thread.
export async function readReminder(
  context: Pick<TasksContext, 'log'>,
  record: LogRecord,
  defaultZone: string,
): Promise<ReminderRead | null> {
  if (record.kind !== 'trigger.fired' || record.thread !== conversationTaskID) {
    return null;
  }

  const fire = parseTriggerFired(record.payload);

  if (fire === null || fire.kind === 'poll') {
    return null;
  }

  const version = await readReminderVersion(context.log.writer.db, fire.definitionHash);

  const zone = await readTriggerZone(
    context.log,
    version?.trigger ?? null,
    record.sequence,
    defaultZone,
  );

  return { fire, name: version?.name ?? null, note: version?.note ?? null, zone };
}

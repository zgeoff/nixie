import { writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { storedTriggerSchema, writeTriggerArming } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { reminderUpdatedCodec } from '../record/reminder-updated-codec';
import type { RemindersContext } from '../types';
import { buildArmedReminder } from './build-armed-reminder';
import { buildReminderHash } from './build-reminder-hash';
import type { ReminderVersion } from './build-reminder-hash';
import type { WrittenReminder } from './write-reminder-set';
import { writeReminderVersion } from './write-reminder-version';

export async function writeReminderUpdate(
  tx: Transaction<unknown>,
  context: Pick<RemindersContext, 'log' | 'definitions'>,
  reminder: WrittenReminder & ReminderVersion,
): Promise<void> {
  const hash = buildReminderHash(reminder);

  await writeReminderVersion(tx, hash, reminder);

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: reminderUpdatedCodec.kind,
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: reminderUpdatedCodec.encode({
        reminderID: reminder.reminderID,
        shortID: reminder.shortID,
        hash,
        trigger: storedTriggerSchema.parse(reminder.trigger),
      }),
    },
  ]);

  await writeTriggerArming(tx, context, {
    armed: [buildArmedReminder(reminder.reminderID, hash, reminder.trigger)],
    withdrawn: [],
  });
}

import { createShortID } from '@heynixie/db';
import { writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { storedTriggerSchema, writeTriggerArming } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { reminderSetCodec } from '../record/reminder-set-codec';
import type { ReminderOrigin, RemindersContext } from '../types';
import { buildArmedReminder } from './build-armed-reminder';
import { buildReminderHash } from './build-reminder-hash';
import type { ReminderVersion } from './build-reminder-hash';
import { writeReminderVersion } from './write-reminder-version';

export interface SetReminder extends ReminderVersion {
  readonly origin: ReminderOrigin;

  // the watermark of the trigger this reminder replaces, epoch milliseconds
  readonly after?: number;
}

export interface WrittenReminder {
  readonly reminderID: string;
  readonly shortID: string;
}

// The record and the trigger.armed record that arms the reminder's trigger go in the caller's
// transaction, so a reminder is never armed without its record.
export async function writeReminderSet(
  tx: Transaction<unknown>,
  context: Pick<RemindersContext, 'log' | 'definitions'>,
  reminder: SetReminder,
): Promise<WrittenReminder> {
  const reminderID = crypto.randomUUID();
  const shortID = createShortID();
  const hash = buildReminderHash(reminder);

  await writeReminderVersion(tx, hash, reminder);

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: reminderSetCodec.kind,
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: reminderSetCodec.encode({
        reminderID,
        shortID,
        hash,
        trigger: storedTriggerSchema.parse(reminder.trigger),
        origin: reminder.origin,
      }),
    },
  ]);

  await writeTriggerArming(tx, context, {
    armed: [buildArmedReminder(reminderID, hash, reminder.trigger, reminder.after)],
    withdrawn: [],
  });

  return { reminderID, shortID };
}

import { writeRecordsInTransaction } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';
import { buildReminderTriggerID, writeTriggerArming } from '@heynixie/triggers';
import type { Transaction } from 'kysely';
import { reminderCancelledCodec } from '../record/reminder-cancelled-codec';
import type { RemindersContext } from '../types';
import type { WrittenReminder } from './write-reminder-set';

export async function writeReminderCancel(
  tx: Transaction<unknown>,
  context: Pick<RemindersContext, 'log' | 'definitions'>,
  reminder: WrittenReminder,
): Promise<void> {
  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: reminderCancelledCodec.kind,
      definitions: context.definitions(),
      thread: conversationTaskID,
      payload: reminderCancelledCodec.encode({
        reminderID: reminder.reminderID,
        shortID: reminder.shortID,
      }),
    },
  ]);

  await writeTriggerArming(tx, context, {
    armed: [],
    withdrawn: [buildReminderTriggerID(reminder.reminderID)],
  });
}

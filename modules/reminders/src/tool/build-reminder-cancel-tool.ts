import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition, ToolOutcome } from '@heynixie/tools';
import { z } from 'zod';
import { readReminderByShortID } from '../reminder/read-reminder-by-short-id';
import { writeReminderCancel } from '../reminder/write-reminder-cancel';
import type { RemindersContext } from '../types';
import { buildReminderInputSchema } from './build-reminder-input-schema';
import { buildUnknownSentence } from './build-unknown-sentence';
import { pickInactiveSentence } from './pick-inactive-sentence';
import { refuseReminder } from './refuse-reminder';
import { reminderToolParts } from './reminder-tool-parts';
import { reminderCancelInputSchema } from './reminder-trigger-schema';

export function buildReminderCancelTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminder.cancel',
    description:
      'Cancels a reminder that is still waiting, so it never fires. Pass its ID from ' +
      'reminders.list. A reminder that already fired or was cancelled is refused with `refused`.',
    input: buildReminderInputSchema(reminderCancelInputSchema),
    output: {
      type: 'object',
      properties: { reminder: { type: 'string' }, refused: reminderToolParts.refusedOutput },
      additionalProperties: false,
    },
    declaration: {
      ...reminderToolParts.noteDeclaration,
      results: { reminder: 'owner_data', refused: 'owner_data' },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = reminderCancelInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const shortID = parsed.data.reminder;

      const outcome = await withWriteTransaction(
        context.log.writer,
        async (tx): Promise<ToolOutcome> => {
          const found = await readReminderByShortID(tx, shortID);

          if (found === null) {
            return refuseReminder('UNKNOWN_REMINDER', buildUnknownSentence(shortID));
          }

          const inactive = pickInactiveSentence(found);

          if (inactive !== null) {
            return refuseReminder('NOT_ACTIVE', inactive);
          }

          await writeReminderCancel(tx, context, found);

          return { status: 'ok', result: { reminder: found.shortID } };
        },
      );

      return outcome;
    },
  };
}

import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { checkReminderTrigger } from '../reminder/check-reminder-trigger';
import { readReminderByShortID } from '../reminder/read-reminder-by-short-id';
import { writeReminderUpdate } from '../reminder/write-reminder-update';
import type { RemindersContext } from '../types';
import { buildReminderInputSchema } from './build-reminder-input-schema';
import { buildReminderResult } from './build-reminder-result';
import { buildUnknownSentence } from './build-unknown-sentence';
import { pickInactiveSentence } from './pick-inactive-sentence';
import { readReminderDescription } from './read-reminder-description';
import { refuseReminder } from './refuse-reminder';
import { reminderToolParts } from './reminder-tool-parts';
import { reminderUpdateInputSchema } from './reminder-trigger-schema';

export function buildReminderUpdateTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminder.update',
    description:
      'Changes a reminder that is still waiting: pass its ID and the name, the note or the trigger ' +
      'to change; a field you leave out stays. A new trigger starts counting from now, and a new ' +
      'name or note alone keeps the schedule going. A one-time reminder that fired and a cancelled ' +
      'one cannot change. A refusal comes back as `refused` with a code and a sentence.',
    input: buildReminderInputSchema(reminderUpdateInputSchema),
    output: {
      type: 'object',
      properties: {
        reminder: { type: 'string' },
        rendered: { type: 'string', description: reminderToolParts.triggerWords },
        next: { type: ['string', 'null'], description: 'the next fire, ISO in UTC' },
        refused: reminderToolParts.refusedOutput,
      },
      additionalProperties: false,
    },
    declaration: {
      ...reminderToolParts.noteDeclaration,
      results: {
        reminder: 'owner_data',
        rendered: 'owner_data',
        next: 'owner_data',
        refused: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = reminderUpdateInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const input = parsed.data;

      if (input.name === undefined && input.note === undefined && input.trigger === undefined) {
        return refuseReminder('NOTHING_TO_CHANGE', 'Pass at least one of name, note and trigger.');
      }

      const given = input.trigger;

      const ownerZone = await context.readZone('owner');

      const checked =
        given === undefined
          ? null
          : checkReminderTrigger(given, {
              now: context.log.writer.clock.now(),
              minGapMinutes: context.minGapMinutes,
              ownerZone,
            });

      if (checked?.status === 'refused') {
        return refuseReminder(checked.code, checked.sentence);
      }

      const outcome = await withWriteTransaction(context.log.writer, async (tx) => {
        const found = await readReminderByShortID(tx, input.reminder);

        if (found === null) {
          return refuseReminder('UNKNOWN_REMINDER', buildUnknownSentence(input.reminder));
        }

        const inactive = pickInactiveSentence(found);

        if (inactive !== null) {
          return refuseReminder('NOT_ACTIVE', inactive);
        }

        const trigger = checked?.trigger ?? found.trigger;

        await writeReminderUpdate(tx, context, {
          reminderID: found.reminderID,
          shortID: found.shortID,
          name: input.name ?? found.name,
          note: input.note ?? found.note,
          trigger,
        });

        return { found, trigger };
      });

      if ('status' in outcome) {
        return outcome;
      }

      const described = await readReminderDescription(context, outcome.found, outcome.trigger);

      return { status: 'ok', result: buildReminderResult(described) };
    },
  };
}

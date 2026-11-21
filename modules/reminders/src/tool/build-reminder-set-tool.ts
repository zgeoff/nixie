import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { z } from 'zod';
import { checkReminderTrigger } from '../reminder/check-reminder-trigger';
import { writeReminderSet } from '../reminder/write-reminder-set';
import type { RemindersContext } from '../types';
import { buildReminderInputSchema } from './build-reminder-input-schema';
import { buildReminderResult } from './build-reminder-result';
import { readReminderDescription } from './read-reminder-description';
import { refuseReminder } from './refuse-reminder';
import { reminderToolParts } from './reminder-tool-parts';
import { reminderSetInputSchema } from './reminder-trigger-schema';

export function buildReminderSetTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminder.set',
    description:
      'Sets a reminder for the owner: a name, a note, and a trigger, either a schedule or one time ' +
      'with `at`. When it fires, the note reaches this conversation as "Reminder: <note>" with ' +
      "its name. An `at` without an offset is read in the owner's zone. A schedule is a `repeat` " +
      'with a frequency, such as {"frequency":"weekly","byDay":["mon"],"at":["09:00"]}, and ' +
      'optional `hours` that limit when it fires, such as hourly from 09:00 to 17:00 on weekdays: ' +
      '{"repeat":{"frequency":"hourly","byDay":["mon","tue","wed","thu","fri"]},' +
      '"hours":{"from":"09:00","until":"17:00"}}. ' +
      `A recurring reminder fires at most every ${context.minGapMinutes} minutes. Returns the ` +
      "reminder's ID, the schedule in words with its zone, and the next 3 fires in local time. A " +
      'refusal comes back as `refused` with a code, the field and a sentence that says what to change.',
    input: buildReminderInputSchema(reminderSetInputSchema),
    output: {
      type: 'object',
      properties: {
        reminder: { type: 'string', description: 'the ID to pass to the other reminder tools' },
        rendered: { type: 'string', description: reminderToolParts.triggerWords },
        next: reminderToolParts.nextFires,
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
      const parsed = reminderSetInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const ownerZone = await context.readZone('owner');

      const checked = checkReminderTrigger(parsed.data.trigger, {
        now: context.log.writer.clock.now(),
        minGapMinutes: context.minGapMinutes,
        ownerZone,
      });

      if (checked.status === 'refused') {
        return refuseReminder(checked.code, checked.sentence, checked.path);
      }

      const written = await withWriteTransaction(context.log.writer, (tx) =>
        writeReminderSet(tx, context, {
          name: parsed.data.name,
          note: parsed.data.note,
          trigger: checked.trigger,
          origin: 'conversation',
        }),
      );

      const described = await readReminderDescription(context, written, checked.trigger);

      return { status: 'ok', result: buildReminderResult(described) };
    },
  };
}

import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import { buildReminderTriggerID, formatZonedISO, writeTriggerDeferral } from '@heynixie/triggers';
import { z } from 'zod';
import type { RemindersContext } from '../types';
import { buildReminderInputSchema } from './build-reminder-input-schema';
import { buildReminderResult } from './build-reminder-result';
import { isDeferralTarget, readDeferralTarget } from './read-deferral-target';
import { readReminderDescription } from './read-reminder-description';
import { reminderToolParts } from './reminder-tool-parts';
import { reminderSkipInputSchema } from './reminder-trigger-schema';

export function buildReminderSkipTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminder.skip',
    description:
      'Drops the next fire of a recurring reminder, and the ones after it still come. Pass its ID ' +
      'from reminders.list. It writes no new version: the reminder, its schedule and its history ' +
      'stay as they are. Returns the fire it dropped and the next 3 fires. A one-time reminder, a ' +
      'reminder that already fired and a cancelled one are refused with `refused`.',
    input: buildReminderInputSchema(reminderSkipInputSchema),
    output: {
      type: 'object',
      properties: {
        reminder: { type: 'string' },
        skipped: { type: 'string', description: 'the fire it dropped, in local time' },
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
        skipped: 'owner_data',
        rendered: 'owner_data',
        next: 'owner_data',
        refused: 'owner_data',
      },
    },
    execution: 'direct',
    run: async (call) => {
      const parsed = reminderSkipInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const target = await readDeferralTarget(context, parsed.data.reminder);

      if (!isDeferralTarget(target)) {
        return target;
      }

      await withWriteTransaction(context.log.writer, (tx) =>
        writeTriggerDeferral(tx, context, {
          definitionID: buildReminderTriggerID(target.found.reminderID),
          slotMs: target.first.slotMs,
          untilMs: null,
        }),
      );

      const described = await readReminderDescription(context, target.found, target.found.trigger);

      return {
        status: 'ok',
        result: buildReminderResult({
          ...described,
          skipped: formatZonedISO(target.first.slotMs, target.zone),
        }),
      };
    },
  };
}

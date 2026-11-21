import { withWriteTransaction } from '@heynixie/log';
import type { ToolDefinition } from '@heynixie/tools';
import {
  buildOffsetAt,
  buildReminderTriggerID,
  formatZonedISO,
  writeTriggerDeferral,
} from '@heynixie/triggers';
import { z } from 'zod';
import type { RemindersContext } from '../types';
import { buildReminderInputSchema } from './build-reminder-input-schema';
import { buildReminderResult } from './build-reminder-result';
import { isDeferralTarget, readDeferralTarget } from './read-deferral-target';
import { readReminderDescription } from './read-reminder-description';
import { refuseReminder } from './refuse-reminder';
import { reminderToolParts } from './reminder-tool-parts';
import { reminderSnoozeInputSchema } from './reminder-trigger-schema';

export function buildReminderSnoozeTool(context: RemindersContext): ToolDefinition {
  return {
    name: 'reminder.snooze',
    description:
      'Holds the next fire of a recurring reminder until a time, so it fires then and not at its ' +
      'slot. Pass its ID from reminders.list and `until`, an ISO 8601 date and time, read in the ' +
      "owner's zone when it holds no offset. `until` must lie after the fire and before the fire " +
      'after it. It writes no new version: the reminder, its schedule and its history stay as ' +
      'they are. Returns the next 3 fires. A one-time reminder, a reminder that already fired ' +
      'and a cancelled one are refused with `refused`.',
    input: buildReminderInputSchema(reminderSnoozeInputSchema),
    output: {
      type: 'object',
      properties: {
        reminder: { type: 'string' },
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
      const parsed = reminderSnoozeInputSchema.safeParse(call.input);

      if (!parsed.success) {
        return { status: 'error', message: z.prettifyError(parsed.error) };
      }

      const target = await readDeferralTarget(context, parsed.data.reminder);

      if (!isDeferralTarget(target)) {
        return target;
      }

      const ownerZone = await context.readZone('owner');

      const untilMs = Date.parse(buildOffsetAt(parsed.data.until, ownerZone));
      const nextSlotMs = target.following?.slotMs ?? Number.POSITIVE_INFINITY;
      const zone = target.zone;

      if (untilMs <= context.log.writer.clock.now()) {
        return refuseReminder(
          'PAST',
          'That time has already passed. Pick a time in the future.',
          'until',
        );
      }

      if (untilMs <= target.first.slotMs) {
        return refuseReminder(
          'NOT_LATER',
          `The next fire is ${formatZonedISO(target.first.slotMs, zone)}, and a snooze holds it until a later time. Pick a time after it.`,
          'until',
        );
      }

      if (untilMs >= nextSlotMs) {
        return refuseReminder(
          'TOO_FAR',
          `The fire after the next is ${formatZonedISO(nextSlotMs, zone)}, and a snooze must end before it. Pick an earlier time, or use reminder.skip to drop the next fire.`,
          'until',
        );
      }

      await withWriteTransaction(context.log.writer, (tx) =>
        writeTriggerDeferral(tx, context, {
          definitionID: buildReminderTriggerID(target.found.reminderID),
          slotMs: target.first.slotMs,
          untilMs,
        }),
      );

      const described = await readReminderDescription(context, target.found, target.found.trigger);

      return { status: 'ok', result: buildReminderResult(described) };
    },
  };
}

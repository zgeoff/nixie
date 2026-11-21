import type { Trigger } from '@heynixie/contract';
import { triggerSchema } from '@heynixie/contract';
import { buildOffsetAt, checkSchedule } from '@heynixie/triggers';
import type { ScheduleRefusal } from '@heynixie/triggers';
import type { z } from 'zod';
import type { reminderTriggerSchema } from '../tool/reminder-trigger-schema';

export type TriggerCheck =
  | { readonly status: 'ok'; readonly trigger: Trigger }
  | {
      readonly status: 'refused';
      readonly code: ScheduleRefusal['code'] | 'PAST' | 'INVALID';

      // the field the refusal is about
      readonly path: string;
      readonly sentence: string;
    };

export interface TriggerFacts {
  // epoch milliseconds
  readonly now: number;
  readonly minGapMinutes: number;

  // the owner's zone, which reads an `at` that holds no offset
  readonly ownerZone: string;
}

// Pure. Reads an `at` without an offset in the owner's zone, and refuses a time already past. A
// schedule goes through the schedule check.
export function checkReminderTrigger(
  given: z.input<typeof reminderTriggerSchema>,
  facts: TriggerFacts,
): TriggerCheck {
  if ('schedule' in given) {
    return checkScheduleTrigger(given, facts);
  }

  const parsed = triggerSchema.safeParse({ at: buildOffsetAt(given.at, facts.ownerZone) });

  if (!parsed.success) {
    return {
      status: 'refused',
      code: 'INVALID',
      path: 'trigger.at',
      sentence: `${parsed.error.issues.map((issue) => issue.message).join('; ')}. Pass an ISO 8601 date and time.`,
    };
  }

  if ('at' in parsed.data && Date.parse(parsed.data.at) <= facts.now) {
    return {
      status: 'refused',
      code: 'PAST',
      path: 'trigger.at',
      sentence: 'That time has already passed. Pick a time in the future.',
    };
  }

  return { status: 'ok', trigger: parsed.data };
}

function checkScheduleTrigger(
  given: Extract<z.input<typeof reminderTriggerSchema>, { schedule: unknown }>,
  facts: TriggerFacts,
): TriggerCheck {
  const parsed = triggerSchema.safeParse(given);

  if (!parsed.success || !('schedule' in parsed.data) || !('repeat' in parsed.data.schedule)) {
    return {
      status: 'refused',
      code: 'INVALID',
      path: 'trigger.schedule',
      sentence: 'The schedule does not match the repeat shape. Check its field names and values.',
    };
  }

  const checked = checkSchedule(parsed.data.schedule, {
    nowMs: facts.now,
    ownerZone: facts.ownerZone,
    minGapMinutes: facts.minGapMinutes,
  });

  return checked.status === 'ok'
    ? { status: 'ok', trigger: { schedule: checked.schedule } }
    : {
        status: 'refused',
        code: checked.code,
        path: `trigger.schedule.${checked.path}`,
        sentence: checked.sentence,
      };
}

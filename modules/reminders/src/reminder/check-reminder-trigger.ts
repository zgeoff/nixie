import { triggerSchema } from '@heynixie/contract';
import type { Trigger } from '@heynixie/contract';
import { buildOffsetAt, getIntervalMs } from '@heynixie/triggers';
import type { z } from 'zod';
import type { reminderTriggerSchema } from '../tool/reminder-trigger-schema';

export type TriggerCheck =
  | { readonly status: 'ok'; readonly trigger: Trigger }
  | {
      readonly status: 'refused';
      readonly code: 'MIN_GAP' | 'PAST' | 'INVALID';
      readonly sentence: string;
    };

export interface TriggerFacts {
  // epoch milliseconds
  readonly now: number;
  readonly minGapMinutes: number;

  // the owner's zone, which reads an `at` that holds no offset
  readonly ownerZone: string;
}

// Pure. Reads an `at` without an offset in the owner's zone, fills the defaults of a schedule, and
// refuses a recurring schedule that fires more often than the minimum gap, or a time already past.
export function checkReminderTrigger(
  given: z.input<typeof reminderTriggerSchema>,
  facts: TriggerFacts,
): TriggerCheck {
  const trigger = 'at' in given ? { at: buildOffsetAt(given.at, facts.ownerZone) } : given;
  const parsed = triggerSchema.safeParse(trigger);

  if (!parsed.success) {
    return {
      status: 'refused',
      code: 'INVALID',
      sentence: parsed.error.issues.map((issue) => issue.message).join('; '),
    };
  }

  if ('at' in parsed.data) {
    return Date.parse(parsed.data.at) > facts.now
      ? { status: 'ok', trigger: parsed.data }
      : {
          status: 'refused',
          code: 'PAST',
          sentence: 'That time has already passed. Pick a time in the future.',
        };
  }

  if (getIntervalMs(parsed.data.schedule.every) < facts.minGapMinutes * 60_000) {
    return {
      status: 'refused',
      code: 'MIN_GAP',
      sentence: `A recurring reminder fires at most every ${facts.minGapMinutes} minutes (reminders.min_gap_minutes).`,
    };
  }

  return { status: 'ok', trigger: parsed.data };
}

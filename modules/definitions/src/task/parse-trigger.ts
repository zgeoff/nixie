import type { Trigger } from '@heynixie/contract';
import { triggerAtSchema, triggerSchema } from '@heynixie/contract';
import { checkScheduleShape } from '@heynixie/triggers';
import { z } from 'zod';
import { formatIssue } from './format-issue';
import type { SeedFaultCode } from './types';

const recordSchema = z.record(z.string(), z.unknown());

export type TriggerResult =
  | { readonly status: 'parsed'; readonly trigger: Trigger | null }
  | {
      readonly status: 'refused';
      readonly fault: Extract<
        SeedFaultCode,
        'bad_schedule' | 'at_without_offset' | 'bad_definition'
      >;
      readonly reasons: readonly string[];
    };

export function parseTrigger(value: unknown): TriggerResult {
  if (value === undefined || value === null) {
    return { status: 'parsed', trigger: null };
  }

  const record = recordSchema.safeParse(value);

  if (record.success && 'at' in record.data && !('schedule' in record.data)) {
    return parseAt(record.data['at'], value);
  }

  return parseSchedule(value);
}

const localDateTimeSchema = z.iso.datetime({ local: true });

function parseAt(at: unknown, value: unknown): TriggerResult {
  if (typeof at !== 'string') {
    return { status: 'refused', fault: 'bad_definition', reasons: ['trigger.at must be text'] };
  }

  if (!triggerAtSchema.safeParse(at).success) {
    return localDateTimeSchema.safeParse(at).success
      ? {
          status: 'refused',
          fault: 'at_without_offset',
          reasons: [],
        }
      : {
          status: 'refused',
          fault: 'bad_definition',
          reasons: ['trigger.at must be an ISO 8601 date-time'],
        };
  }

  return parseSchedule(value);
}

// A schedule in the repeat shape also goes through the shape check, which refuses a mix of fields
// that never go together with the field and a fix.
function parseSchedule(value: unknown): TriggerResult {
  const parsed = triggerSchema.safeParse(value);

  if (!parsed.success) {
    return {
      status: 'refused',
      fault: 'bad_schedule',
      reasons: parsed.error.issues.map((issue) => formatIssue(issue)),
    };
  }

  if ('schedule' in parsed.data && 'repeat' in parsed.data.schedule) {
    const refusal = checkScheduleShape(parsed.data.schedule);

    if (refusal !== null) {
      return {
        status: 'refused',
        fault: 'bad_schedule',
        reasons: [`trigger.schedule.${refusal.path}: ${refusal.sentence}`],
      };
    }
  }

  return { status: 'parsed', trigger: parsed.data };
}

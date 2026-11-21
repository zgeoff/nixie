import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import type { ArmedDefinition } from '../types';

const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);
const windowSchema = z.strictObject({ from: z.string(), until: z.string() });

const everySchema = z.union([
  z.enum(['day', 'week', 'hour']),
  z.strictObject({ minutes: z.int() }),
]);

// The stored form of a schedule with its defaults filled, in the repeat shape and in the older one
// that every earlier record holds. It leaves a member out when it is unset,
// so the record holds plain JSON.
const storedLegacyScheduleSchema = z.strictObject({
  every: everySchema,
  at: z.string().exactOptional(),
  on: weekdaySchema.exactOptional(),
  window: windowSchema.exactOptional(),
  idleMinutes: z.int().exactOptional(),
  zone: z.string(),
  catchUp: z.enum(['once', 'skip']),
});

const storedByDaySchema = z.union([
  weekdaySchema,
  z.strictObject({ day: weekdaySchema, nth: z.int().exactOptional() }),
]);

const frequencySchema = z.enum(['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly']);
const byDayListSchema = z.array(storedByDaySchema);
const intListSchema = z.array(z.int());
const stringListSchema = z.array(z.string());

const storedRepeatSchema = z.strictObject({
  frequency: frequencySchema,
  interval: z.int().exactOptional(),
  byDay: byDayListSchema.exactOptional(),
  byMonthDay: intListSchema.exactOptional(),
  byMonth: intListSchema.exactOptional(),
  at: stringListSchema.exactOptional(),
  starts: z.string().exactOptional(),
});

const storedRepeatScheduleSchema = z.strictObject({
  repeat: storedRepeatSchema,
  hours: windowSchema.exactOptional(),
  zone: z.string(),
  catchUp: z.enum(['once', 'skip']),
});

export const storedTriggerSchema = z.union([
  z.strictObject({ schedule: storedRepeatScheduleSchema }),
  z.strictObject({ schedule: storedLegacyScheduleSchema }),
  z.strictObject({ at: z.string() }),
]);

const armedEntrySchema = z.object({
  definitionID: z.string(),
  definitionHash: z.string(),
  source: z.literal('schedule'),
  target: z.enum(['task', 'conversation']),
  trigger: storedTriggerSchema,
  after: z.number().exactOptional(),
});

// The definitions that can fire: those added, changed or back in force, and the IDs of those out of
// force. It sits on no thread.
const armedPayloadSchema = z.object({
  armed: z.array(armedEntrySchema),
  withdrawn: z.array(z.string()),
});

export const triggerArmedCodec = defineRecordCodec('trigger.armed', armedPayloadSchema);

export function toArmedEntry(definition: ArmedDefinition) {
  return { ...definition, trigger: storedTriggerSchema.parse(definition.trigger) };
}

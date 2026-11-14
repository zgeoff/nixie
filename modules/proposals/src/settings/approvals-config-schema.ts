import { z } from 'zod';

const timeOfDaySchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, { message: 'expected a time of day as HH:MM' });

export const quietHoursSchema = z.strictObject({
  start: timeOfDaySchema.describe('When quiet hours begin, as HH:MM in your time zone.'),
  end: timeOfDaySchema.describe('When quiet hours end, as HH:MM in your time zone.'),
});

const deferSchema = z.strictObject({
  default_minutes: z
    .int()
    .positive()
    .default(60)
    .describe('Minutes for the "1 hour" choice of Defer.'),
  evening_at: timeOfDaySchema
    .default('18:00')
    .describe('"This evening" means today before this time, and tomorrow after it.'),
  morning_at: timeOfDaySchema.default('08:00').describe('"Tomorrow morning" means this time.'),
});

export const approvalsConfigSchema = z.strictObject({
  defer: deferSchema.default(deferSchema.parse({})),
});

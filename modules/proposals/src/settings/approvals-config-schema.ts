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

const lapseDaysSchema = z.strictObject({
  action: z.int().positive().default(3).describe('Days a held action waits before it lapses.'),
  memory: z.int().positive().default(14).describe('Days a memory proposal waits before it lapses.'),
  skill: z.int().positive().default(14).describe('Days a skill write waits before it lapses.'),
  rule_change: z
    .int()
    .positive()
    .default(14)
    .describe(
      'Days a rule change waits before it lapses. A rule widening and a suggested rule use it; a mandate lapses at its deadline only.',
    ),
  prompt: z.int().positive().default(14).describe('Days a prompt override waits before it lapses.'),
  mcp: z.int().positive().default(14).describe('Days an MCP proposal waits before it lapses.'),
});

export const approvalsConfigSchema = z.strictObject({
  defer: deferSchema.default(deferSchema.parse({})),
  lapse_days: lapseDaysSchema.default(lapseDaysSchema.parse({})),
  passkey_window_minutes: z
    .int()
    .positive()
    .default(10)
    .describe(
      'Minutes after a passkey tap in which the same signed-in browser skips the passkey. Adding or removing a passkey always asks.',
    ),
});

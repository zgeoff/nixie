import { z } from 'zod';
import { isTimeZone } from './is-time-zone';

const clockTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, 'a time is HH:MM, 24-hour');

const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

const zoneSchema = z
  .string()
  .refine((zone) => zone === 'owner' || isTimeZone(zone), 'a zone is owner or an IANA zone')
  .default('owner');

const hoursSchema = z.strictObject({ from: clockTimeSchema, until: clockTimeSchema });

const byDaySchema = z.union([
  weekdaySchema,
  z.strictObject({
    day: weekdaySchema,
    nth: z
      .int()
      .min(-5)
      .max(5)
      .refine((nth) => nth !== 0, 'nth counts from 1, or from -1 for the last')
      .optional(),
  }),
]);

// The repeat of a schedule, shaped after the recurrence rule of RFC 5545. A rule that mixes fields
// that never go together is no schema error: the schedule checker refuses it with a code, a field
// path and a sentence that says how to fix it.
const repeatSchema = z.strictObject({
  frequency: z
    .enum(['minutely', 'hourly', 'daily', 'weekly', 'monthly', 'yearly'])
    .describe('how often it fires. minutely and hourly count elapsed time; the others count days'),
  interval: z
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('every nth frequency, such as 2 with weekly for every 2 weeks. Default 1'),
  byDay: z
    .array(byDaySchema)
    .min(1)
    .optional()
    .describe(
      'the weekdays it fires on, such as ["mon","fri"], or {"day":"fri","nth":-1} for the last ' +
        'Friday (monthly or yearly only)',
    ),
  byMonthDay: z
    .array(
      z
        .int()
        .min(-31)
        .max(31)
        .refine((day) => day !== 0, 'a day of the month is 1 to 31, or -1 for the last'),
    )
    .min(1)
    .optional()
    .describe('the days of the month it fires on, 1 to 31, or -1 for the last day'),
  byMonth: z
    .array(z.int().min(1).max(12))
    .min(1)
    .optional()
    .describe('the months it fires in, 1 to 12'),
  at: z
    .array(clockTimeSchema)
    .min(1)
    .optional()
    .describe('the times of day it fires, HH:MM 24-hour. Daily and longer frequencies need it'),
  starts: z.iso
    .date()
    .optional()
    .describe(
      'the date it counts from, YYYY-MM-DD. Needed for an interval above 1, and for a weekly, ' +
        'monthly or yearly schedule that names no day. Otherwise it defaults to the day it is set',
    ),
});

export const repeatScheduleSchema = z.strictObject({
  repeat: repeatSchema,
  hours: hoursSchema
    .optional()
    .describe(
      'limits when it may fire to the hours of the day, both ends included, such as ' +
        '{"from":"09:00","until":"17:00"}',
    ),
  zone: zoneSchema,
  catchUp: z.enum(['once', 'skip']).default('once'),
});

const minutesSchema = z.strictObject({
  minutes: z.int().min(5).max(1440),
});

// The schedule of every record written before the repeat shape. Stored records and a definition
// repo's task.yaml still hold it, and each stays readable forever.
const legacyScheduleSchema = z
  .strictObject({
    every: z.union([z.enum(['day', 'week', 'hour']), minutesSchema]),
    at: clockTimeSchema.optional(),
    on: weekdaySchema.optional(),
    window: hoursSchema.optional(),
    idleMinutes: z.int().min(1).max(720).optional(),
    zone: zoneSchema,
    catchUp: z.enum(['once', 'skip']).default('once'),
  })
  .superRefine((schedule, context) => {
    const isCalendar = schedule.every === 'day' || schedule.every === 'week';

    if (isCalendar && schedule.at === undefined && schedule.window === undefined) {
      context.addIssue({ code: 'custom', message: 'day and week need at or window' });
    }

    if (isCalendar && schedule.at !== undefined && schedule.window !== undefined) {
      context.addIssue({ code: 'custom', message: 'at and window never come together' });
    }

    if (!isCalendar && schedule.at !== undefined) {
      context.addIssue({ code: 'custom', message: 'hour and minutes schedules take no at' });
    }

    if (!isCalendar && schedule.window !== undefined) {
      context.addIssue({ code: 'custom', message: 'hour and minutes schedules take no window' });
    }

    if (schedule.every === 'week' && schedule.on === undefined) {
      context.addIssue({ code: 'custom', message: 'a week schedule needs on' });
    }

    if (schedule.every !== 'week' && schedule.on !== undefined) {
      context.addIssue({ code: 'custom', message: 'only a week schedule takes on' });
    }

    if (schedule.idleMinutes !== undefined && schedule.window === undefined) {
      context.addIssue({ code: 'custom', message: 'idleMinutes needs window' });
    }
  });

export const scheduleSchema = z.union([repeatScheduleSchema, legacyScheduleSchema]);

export type Repeat = z.output<typeof repeatSchema>;

export type Hours = z.output<typeof hoursSchema>;

export type RepeatSchedule = z.output<typeof repeatScheduleSchema>;

export type LegacySchedule = z.output<typeof legacyScheduleSchema>;

export type Schedule = z.output<typeof scheduleSchema>;

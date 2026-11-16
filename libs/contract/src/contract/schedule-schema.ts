import { z } from 'zod';
import { isTimeZone } from './is-time-zone';

const clockTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/u, 'a time is HH:MM, 24-hour');

const minutesSchema = z.strictObject({
  minutes: z.int().min(5).max(1440),
});

const weekdaySchema = z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']);

export const scheduleSchema = z
  .strictObject({
    every: z.union([z.enum(['day', 'week', 'hour']), minutesSchema]),
    at: clockTimeSchema.optional(),
    on: weekdaySchema.optional(),
    window: z.strictObject({ from: clockTimeSchema, until: clockTimeSchema }).optional(),
    idleMinutes: z.int().min(1).max(720).optional(),
    zone: z
      .string()
      .refine((zone) => zone === 'owner' || isTimeZone(zone), 'a zone is owner or an IANA zone')
      .default('owner'),
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

export type Schedule = z.output<typeof scheduleSchema>;

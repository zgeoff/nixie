import { z } from 'zod';
import { scheduleSchema } from './schedule-schema';

// An ISO 8601 date-time that holds an offset or Z.
export const triggerAtSchema = z.iso.datetime({ offset: true });

export const triggerSchema = z.union([
  z.strictObject({ schedule: scheduleSchema }),
  z.strictObject({ at: triggerAtSchema }),
]);

export type Trigger = z.output<typeof triggerSchema>;

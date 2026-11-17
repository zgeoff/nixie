import { scheduleSchema } from '@heynixie/contract';
import { z } from 'zod';

// An `at` may hold no offset: the tool reads it in the owner's zone
export const reminderTriggerSchema = z.union([
  z.strictObject({ schedule: scheduleSchema }),
  z.strictObject({ at: z.iso.datetime({ offset: true, local: true }) }),
]);

export const reminderSetInputSchema = z.strictObject({
  name: z.string().min(1),
  note: z.string().min(1),
  trigger: reminderTriggerSchema,
});

export const reminderUpdateInputSchema = z.strictObject({
  reminder: z.string().min(1),
  name: z.string().min(1).optional(),
  note: z.string().min(1).optional(),
  trigger: reminderTriggerSchema.optional(),
});

export const reminderCancelInputSchema = z.strictObject({ reminder: z.string().min(1) });

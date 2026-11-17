import { z } from 'zod';
import { signedIn } from './signed-in';
import { triggerSchema } from './trigger-schema';

const listedReminderSchema = z.object({
  // the short ID that names the reminder
  reminder: z.string(),
  name: z.string(),
  note: z.string(),
  trigger: triggerSchema,

  // the trigger in words
  rendered: z.string(),
  state: z.enum(['active', 'fired']),

  // ISO in UTC; null when no fire is left
  next: z.string().nullable(),

  // the newest 3 fires, ISO in UTC, oldest first
  recentFires: z.array(z.string()),
});

export const remindersContract = {
  list: signedIn.output(z.object({ reminders: z.array(listedReminderSchema) })),
  cancel: signedIn
    .errors({
      NOT_FOUND: { message: 'No reminder has this ID', status: 404 },
      NOT_ACTIVE: { message: 'The reminder already fired or was cancelled', status: 409 },
    })
    .input(z.object({ reminder: z.string().min(1).max(64) }))
    .output(z.object({ reminder: z.string() })),
};

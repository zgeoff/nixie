import { defineRecordCodec } from '@heynixie/log';
import { storedTriggerSchema } from '@heynixie/triggers';
import { z } from 'zod';

// The name and the note are free text, so the record holds the hash of the version that has them.
export const reminderSetCodec = defineRecordCodec(
  'reminder.set',
  z.object({
    reminderID: z.string(),
    shortID: z.string(),
    hash: z.string(),
    trigger: storedTriggerSchema,
    origin: z.enum(['conversation', 'migration']),
  }),
);

import { defineRecordCodec } from '@heynixie/log';
import { storedTriggerSchema } from '@heynixie/triggers';
import { z } from 'zod';

export const reminderUpdatedCodec = defineRecordCodec(
  'reminder.updated',
  z.object({
    reminderID: z.string(),
    shortID: z.string(),
    hash: z.string(),
    trigger: storedTriggerSchema,
  }),
);

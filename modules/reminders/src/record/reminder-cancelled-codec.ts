import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const reminderCancelledCodec = defineRecordCodec(
  'reminder.cancelled',
  z.object({ reminderID: z.string(), shortID: z.string() }),
);

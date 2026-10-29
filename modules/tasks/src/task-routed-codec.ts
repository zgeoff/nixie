import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskRoutedCodec = defineRecordCodec(
  'task.routed',
  z.object({
    taskID: z.string(),
    via: z.enum(['start', 'message']),
    messageID: z.string().nullable(),
    messages: z.int().array(),
  }),
);

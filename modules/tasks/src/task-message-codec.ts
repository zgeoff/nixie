import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskMessageKindSchema } from './task-message-kind-schema';

export const taskMessageCodec = defineRecordCodec(
  'task_message',
  z.object({
    messageID: z.string(),
    from: z.string(),
    to: z.string(),
    kind: taskMessageKindSchema,
    replyTo: z.string().nullable(),
    onBehalfOf: z.string().array(),
    hop: z.int(),
    hopLimit: z.int(),
    wake: z.boolean(),
    woke: z.boolean(),
    source: z.string(),
  }),
);

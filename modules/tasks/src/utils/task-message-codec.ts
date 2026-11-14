import { taskMessageKindSchema } from '@heynixie/contract';
import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

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
    opensWait: z.boolean().nullable().default(null),
    source: z.string(),
  }),
);

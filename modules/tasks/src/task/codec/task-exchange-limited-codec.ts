import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const waitSchema = z.object({ taskID: z.string(), onTaskID: z.string() });

export const taskExchangeLimitedCodec = defineRecordCodec(
  'task.exchange_limited',
  z.object({
    messageID: z.string(),
    stepKey: z.string(),
    from: z.string(),
    to: z.string(),
    hops: z.int(),
    waiting: waitSchema.nullable(),
  }),
);

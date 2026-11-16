import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const positiveCount = z.int().positive();

const limitsSchema = z.object({
  minutes: z.number().positive(),
  turns: positiveCount,
  tokens: positiveCount,
  dollars: z.number().positive(),
});

// The question sits in the erasable input of the calling tool_called, so this record has no
// erasable field.
export const workerRunStartedCodec = defineRecordCodec(
  'worker.run_started',
  z.object({
    workerRunID: z.uuid(),
    shortID: z.string().min(1),
    callID: z.string(),
    stepRunID: z.string(),
    taskRunID: z.string().exactOptional(),
    model: z.string(),
    profile: z.string(),
    tools: z.string().array(),
    limits: limitsSchema,

    // the dollars are what the task had left
    isTaskLimit: z.boolean(),
  }),
);

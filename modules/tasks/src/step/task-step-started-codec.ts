import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { wakeCauseSchema } from './wake-cause-schema';

export const taskStepStartedCodec = defineRecordCodec(
  'task.step_started',
  z.object({
    taskID: z.string(),
    stepKey: z.string(),
    generation: z.int(),
    hop: z.int().exactOptional(),
    cause: wakeCauseSchema.exactOptional(),
  }),
);

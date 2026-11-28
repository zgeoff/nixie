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

    // the sequence of the waking record that gave the step its hop and cause
    source: z.int().exactOptional(),
  }),
);

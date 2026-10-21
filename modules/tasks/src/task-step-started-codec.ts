import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskStepStartedCodec = defineRecordCodec(
  'task.step_started',
  z.object({ taskID: z.string(), stepKey: z.string(), generation: z.int() }),
);

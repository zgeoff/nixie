import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskStepInterruptedCodec = defineRecordCodec(
  'task.step_interrupted',
  z.object({ taskID: z.string(), stepKey: z.string() }),
);

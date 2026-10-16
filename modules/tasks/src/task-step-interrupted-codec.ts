import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A step that started and never committed, which a later claim or recovery found.
export const taskStepInterruptedCodec = defineRecordCodec(
  'task.step_interrupted',
  z.object({ taskID: z.string(), stepKey: z.string() }),
);

import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// A claimed step, its key, and the lease generation of the claim that started it.
export const taskStepStartedCodec = defineRecordCodec(
  'task.step_started',
  z.object({ taskID: z.string(), stepKey: z.string(), generation: z.int() }),
);

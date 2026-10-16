import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

// A failed step: the task's next state, its errors in a row, the limit in force, and when it can be
// claimed again. A record from before nixie recorded the step key and the limit lacks them.
export const taskStepErroredCodec = defineRecordCodec(
  'task.step_errored',
  z.object({
    taskID: z.string(),
    stepKey: z.string().exactOptional(),
    nextState: taskStateSchema,
    errors: z.int(),
    errorLimit: z.int().exactOptional(),
    claimableAt: z.number(),
  }),
);

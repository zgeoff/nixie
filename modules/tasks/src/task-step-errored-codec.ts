import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

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

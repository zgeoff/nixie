import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

// a durable timer the step set, and when it comes due
const timerSchema = z.object({ timerID: z.string(), dueAt: z.number() });

// A step's commit: the task's next state, how far it read its inbox, its session boundary, and each
// timer it set. The record's own step key names the step.
export const taskStepCommittedCodec = defineRecordCodec(
  'task.step_committed',
  z.object({
    taskID: z.string(),
    nextState: taskStateSchema,
    readCursor: z.int(),
    sessionBoundary: z.string().nullable(),
    timers: timerSchema.array(),
  }),
);

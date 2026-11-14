import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskStateSchema } from './task-state-schema';

const timerSchema = z.object({ timerID: z.string(), dueAt: z.number() });

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

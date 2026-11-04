import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskLimitsSchema } from './task-limits-schema';

export const taskLimitsRaisedCodec = defineRecordCodec(
  'task.limits_raised',
  z.object({ taskID: z.string(), limits: taskLimitsSchema }),
);

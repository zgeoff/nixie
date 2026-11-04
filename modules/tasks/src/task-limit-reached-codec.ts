import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskLimitsSchema } from './task-limits-schema';
import { taskUsageSchema } from './task-usage-schema';

export const taskLimitReachedCodec = defineRecordCodec(
  'task.limit_reached',
  z.object({
    taskID: z.string(),
    stepKey: z.string(),
    used: taskUsageSchema,
    limits: taskLimitsSchema,
  }),
);

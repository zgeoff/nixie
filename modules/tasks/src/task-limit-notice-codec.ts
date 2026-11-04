import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskLimitsSchema } from './task-limits-schema';
import { taskUsageSchema } from './task-usage-schema';

export const taskLimitNoticeCodec = defineRecordCodec(
  'task.limit_notice',
  z.object({ taskID: z.string(), used: taskUsageSchema, limits: taskLimitsSchema }),
);

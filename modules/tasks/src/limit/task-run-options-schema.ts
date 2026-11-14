import { z } from 'zod';
import type { TaskRunOptions } from '../types';
import { taskLimitsSchema } from './task-limits-schema';

export const taskRunOptionsSchema = z.object({
  model: z.string().nullable(),
  profile: z.string().nullable(),
  persona: z.enum(['default', 'none']),
  memory: z.enum(['none', 'read']),
  tools: z.string().array(),
  report: z.enum(['wake', 'next_turn', 'none']),
  limits: taskLimitsSchema,
}) satisfies z.ZodType<TaskRunOptions>;

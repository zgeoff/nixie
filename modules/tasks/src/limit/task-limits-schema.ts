import { z } from 'zod';
import type { TaskLimits } from '../types';

export const taskLimitsSchema = z.object({
  turns: z.int().positive().nullable(),
  dollars: z.number().positive().nullable(),
}) satisfies z.ZodType<TaskLimits>;

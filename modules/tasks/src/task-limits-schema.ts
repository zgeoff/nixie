import { z } from 'zod';
import type { TaskLimits } from './types';

export const taskLimitsSchema = z.object({
  turns: z.int().positive(),
  dollars: z.number().positive(),
}) satisfies z.ZodType<TaskLimits>;

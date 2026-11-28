import { z } from 'zod';
import type { TaskLimits } from '../types';
import { buildLimitSchema } from './build-limit-schema';

export const taskLimitsSchema = z.object({
  turns: buildLimitSchema(z.int().positive()),
  dollars: buildLimitSchema(z.number().positive()),
}) satisfies z.ZodType<TaskLimits>;

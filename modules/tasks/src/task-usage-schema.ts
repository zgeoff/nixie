import { z } from 'zod';
import type { TaskLimits } from './types';

const usedTurnsSchema = z.int().nonnegative();
const usedDollarsSchema = z.number().nonnegative();

export const taskUsageSchema = z.object({
  turns: usedTurnsSchema,
  dollars: usedDollarsSchema,
}) satisfies z.ZodType<TaskLimits>;

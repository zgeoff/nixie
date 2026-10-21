import { z } from 'zod';

export const taskSchema = z.object({
  error: z.string().optional(),
  errorLimit: z.int().positive().optional(),
  errors: z.int().positive().optional(),
  retryAt: z.date().optional(),
  stepKey: z.string().optional(),
  taskID: z.string(),
});

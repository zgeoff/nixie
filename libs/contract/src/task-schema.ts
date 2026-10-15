import { z } from 'zod';

// A failed step's record carries the error its step threw, while the record is readable, the
// errors in a row with this one, the limit in force, and when the task tries again. The
// conversation never fails, so its errors can pass the limit, and a client shows that it is failing.
export const taskSchema = z.object({
  error: z.string().optional(),
  errorLimit: z.int().positive().optional(),
  errors: z.int().positive().optional(),
  retryAt: z.date().optional(),
  stepKey: z.string().optional(),
  taskID: z.string(),
});

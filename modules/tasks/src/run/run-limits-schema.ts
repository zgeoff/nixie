import { z } from 'zod';

// A carried task run can hold a limit of 0, because a raise takes the use off the new total.
export const runLimitsSchema = z.object({
  turns: z.int().nonnegative().nullable(),
  dollars: z.number().nonnegative().nullable(),
  calls: z.record(z.string(), z.int().positive()),
});

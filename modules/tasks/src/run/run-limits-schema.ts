import { z } from 'zod';
import { buildLimitSchema } from '../limit/build-limit-schema';

// A carried task run can hold a limit of 0, because a raise takes the use off the new total.
export const runLimitsSchema = z.object({
  turns: buildLimitSchema(z.int().nonnegative()),
  dollars: buildLimitSchema(z.number().nonnegative()),
  calls: z.record(z.string(), z.int().positive()),
});

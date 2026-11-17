import { z } from 'zod';

export const remindersConfigSchema = z.strictObject({
  // the shortest gap between 2 fires of a recurring reminder, in minutes
  min_gap_minutes: z.int().min(1).default(15),
});

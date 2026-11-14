import { z } from 'zod';

export const taskMessageResultSchema = z.object({
  messageID: z.string(),
  woke: z.boolean(),
  hop: z.int().nonnegative(),
  note: z.string().optional(),
});

import { z } from 'zod';

export const fileSendInputSchema = z.object({
  file: z.string().min(1).max(100),
  caption: z.string().min(1).max(1000).optional(),
});

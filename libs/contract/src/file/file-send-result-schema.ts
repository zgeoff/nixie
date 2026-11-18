import { z } from 'zod';

export const fileSendResultSchema = z.object({
  file: z.string(),
  name: z.string(),
  bytes: z.int().nonnegative(),
  mediaType: z.string(),
});

import { z } from 'zod';

export const changeTextSchema = z.strictObject({
  text: z.string().nullable(),
  reason: z.string(),
  salt: z.string(),
});

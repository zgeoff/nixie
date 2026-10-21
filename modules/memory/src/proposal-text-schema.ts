import { z } from 'zod';

export const proposalTextSchema = z.strictObject({
  text: z.string(),
  quote: z.string().nullable(),
  checkerReason: z.string().nullable(),
  salt: z.string(),
});

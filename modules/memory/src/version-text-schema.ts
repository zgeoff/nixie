import { z } from 'zod';

export const versionTextSchema = z.strictObject({
  text: z.string(),
  evidenceQuote: z.string().nullable(),
  intentQuote: z.string().nullable(),
});

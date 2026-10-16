import { z } from 'zod';

// A version's free text, which nixie seals under its item's key.
export const versionTextSchema = z.strictObject({
  text: z.string(),
  evidenceQuote: z.string().nullable(),
  intentQuote: z.string().nullable(),
});

import { z } from 'zod';

// The free text of a consolidation change, which nixie seals under its first input's key, so a
// forget of that item makes the change unreadable too.
export const changeTextSchema = z.strictObject({
  // the text the change writes, or null for a retirement
  text: z.string().nullable(),
  reason: z.string(),
  salt: z.string(),
});

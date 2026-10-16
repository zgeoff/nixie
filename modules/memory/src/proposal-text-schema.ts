import { z } from 'zod';

// The free text of a memory proposal, which nixie seals under its item's key, so a forget of the
// item makes the proposal unreadable too.
export const proposalTextSchema = z.strictObject({
  // the proposed text, or the item's text for a retirement
  text: z.string(),
  quote: z.string().nullable(),
  checkerReason: z.string().nullable(),
  salt: z.string(),
});

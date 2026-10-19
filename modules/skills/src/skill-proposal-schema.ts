import { z } from 'zod';

// A skill that nixie proposes to write, for your review: its files, the version it would replace,
// and the outcome of the token check. The proposal ID is the short ID the model reads.
export const skillProposalSchema = z.object({
  proposalID: z.string(),
  name: z.string(),
  skillHash: z.string(),

  // the version in force that the skill would replace, or null for a new skill
  baseHash: z.string().nullable(),
  files: z.object({ path: z.string(), text: z.string() }).array(),

  // the first destination-like token in the files that you never typed and your definitions lack,
  // or null when the token check passed
  untypedToken: z.object({ kind: z.string(), raw: z.string() }).nullable(),

  // the run and the tool call that proposed the skill
  provenance: z.object({ runID: z.string(), callID: z.string(), profile: z.string() }),
});

import { z } from 'zod';

export const skillProposalSchema = z.object({
  proposalID: z.string(),
  name: z.string(),
  skillHash: z.string(),

  baseHash: z.string().nullable(),
  files: z.object({ path: z.string(), text: z.string() }).array(),

  untypedToken: z.object({ kind: z.string(), raw: z.string() }).nullable(),

  provenance: z.object({ runID: z.string(), callID: z.string(), profile: z.string() }),
});

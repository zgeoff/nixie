import { z } from 'zod';
import { promptIDs } from './prompt-ids';

export const promptPartFileSchema = z.object({ path: z.string(), text: z.string() });

export const promptProposalSchema = z.object({
  proposalID: z.string(),
  promptID: z.enum(promptIDs),
  proposalHash: z.string(),

  baseHash: z.string().nullable(),
  entry: z.record(z.string(), z.string()),
  files: promptPartFileSchema.array(),
  reason: z.string(),

  provenance: z.object({ runID: z.string(), callID: z.string(), profile: z.string() }),
});

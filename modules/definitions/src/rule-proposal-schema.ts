import { z } from 'zod';

const ruleSideSchema = z.object({ hash: z.string(), sentence: z.string() }).nullable();

const fieldChangeSchema = z.object({
  field: z.string(),
  before: z.string().nullable(),
  after: z.string().nullable(),
});

export const ruleProposalSchema = z.object({
  proposalID: z.string(),
  proposalHash: z.string(),
  changes: z
    .object({
      ruleID: z.string(),
      before: ruleSideSchema,
      after: ruleSideSchema,
      fields: fieldChangeSchema.array(),
    })
    .array(),
});

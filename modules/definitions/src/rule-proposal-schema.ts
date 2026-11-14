import { effectNames } from '@heynixie/policy';
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

  // lifting when the change creates or widens a rule that allows an effect of the always-ask set
  riskClass: z.literal('lifting').exactOptional(),

  // effects that leave a tool, which wait for your approval as the rules do
  effectChanges: z
    .object({ tool: z.string(), remove: z.enum(effectNames).array() })
    .array()
    .default([]),
});

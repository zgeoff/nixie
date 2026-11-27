import { z } from 'zod';
import { ruleVersionSchema } from './rule-version-schema';

export const ruleProposalChangeSchema = z.object({
  ruleID: z.string(),
  before: ruleVersionSchema,
  after: ruleVersionSchema,
});

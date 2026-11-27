import { z } from 'zod';
import { ruleVersionSchema } from './rule-version-schema';

export const ruleConflictSchema = z.object({
  ruleID: z.string(),
  changeID: z.string(),
  nixie: ruleVersionSchema,
  repo: ruleVersionSchema,
  base: ruleVersionSchema,
  changedBy: z.enum(['owner', 'nixie']),
  reason: z.string(),
  changedAt: z.date(),
});

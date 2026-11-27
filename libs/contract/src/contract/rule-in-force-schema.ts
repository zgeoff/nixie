import { z } from 'zod';
import { ruleConditionSchema } from './rule-condition-schema';

export const ruleInForceSchema = z.object({
  ruleID: z.string(),
  revision: z.int().positive(),
  ruleHash: z.string(),
  sentence: z.string(),
  condition: ruleConditionSchema.optional(),
  origin: z.enum(['definitions', 'nixie']),
  changeID: z.string().nullable(),
  lastFiredAt: z.date().nullable(),
});

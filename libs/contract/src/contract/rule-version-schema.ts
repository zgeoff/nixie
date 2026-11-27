import { z } from 'zod';
import { ruleConditionSchema } from './rule-condition-schema';

export const ruleVersionSchema = z
  .object({
    ruleHash: z.string(),
    sentence: z.string(),
    condition: ruleConditionSchema.optional(),
  })
  .nullable();

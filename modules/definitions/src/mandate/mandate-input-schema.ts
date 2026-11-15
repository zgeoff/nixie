import { ruleObjectSchema } from '@heynixie/policy';
import { z } from 'zod';

const mandateRuleSchema = ruleObjectSchema
  .omit({ outcome: true, mandate: true, expires: true })
  .extend({ outcome: z.literal('allow') });

export const mandateInputSchema = z.strictObject({
  title: z.string().min(1).max(120).describe('A label on the card, never part of a rule'),
  rules: z
    .array(mandateRuleSchema)
    .min(1)
    .max(10)
    .describe('The allow rules of the mandate, in the rule format'),
  expires: z.iso
    .datetime({ offset: true })
    .optional()
    .describe(
      'When the mandate ends: an ISO date and time with an offset. Default: the next midnight',
    ),
});

export type MandateInput = z.output<typeof mandateInputSchema>;

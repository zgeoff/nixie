import { oc } from '@orpc/contract';
import { z } from 'zod';

const mandates = oc.errors({
  NOT_FOUND: { message: 'no mandate has that ID', status: 404 },
});

const hostMandateRuleSchema = z.object({ ruleID: z.string(), sentence: z.string() });

const hostMandateSchema = z.object({
  mandateID: z.string(),
  title: z.string().nullable(),
  rules: z.array(hostMandateRuleSchema),
  startedAt: z.date(),
  expires: z.date(),
});

export const hostMandatesContract = {
  list: mandates.output(z.array(hostMandateSchema)),

  end: mandates
    .input(z.strictObject({ mandateID: z.string().min(1) }))
    .output(z.object({ mandateID: z.string(), state: z.enum(['ended', 'expired']) })),
};

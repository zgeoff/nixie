import { oc } from '@orpc/contract';
import { z } from 'zod';

const budgets = oc.errors({
  BUDGETS_NOT_CONFIGURED: { message: 'the server holds no budgets', status: 409 },
});

const budgetStatusSchema = z.object({
  budgetID: z.string(),
  counts: z.string(),
  limitMicros: z.number(),
  period: z.enum(['day', 'week', 'month']),
  spentMicros: z.number(),
  resetsAt: z.date(),
  source: z.enum(['definitions', 'built_in']),
});

const budgetChargeSchema = z.object({
  chargeID: z.string(),
  amountMicros: z.number(),
  for: z.object({ kind: z.string(), id: z.string() }),
  isCredited: z.boolean(),
});

export const hostBudgetsContract = {
  list: budgets.output(z.array(budgetStatusSchema)),

  ledger: budgets
    .errors({ NOT_FOUND: { message: 'no budget has that ID', status: 404 } })
    .input(z.strictObject({ budgetID: z.string().min(1) }))
    .output(
      z.object({
        budgetID: z.string(),
        periodStart: z.string(),
        resetsAt: z.date(),
        spentMicros: z.number(),
        charges: z.array(budgetChargeSchema),
      }),
    ),
};

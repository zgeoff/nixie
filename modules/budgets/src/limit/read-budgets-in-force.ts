import { budgetPeriods, storedBudgetCountsSchema } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { BudgetLimit, BudgetsTables } from '../types';

const rowSchema = z.object({
  budget_id: z.string(),
  counts: storedBudgetCountsSchema,
  limit_micros: z.number(),
  period: z.enum(budgetPeriods),
});

// The budgets that the seed put in force. A raised limit that waits for approval is not among them.
export async function readBudgetsInForce(db: Kysely<unknown>): Promise<readonly BudgetLimit[]> {
  const rows = await db
    .$extendTables<BudgetsTables>()
    .selectFrom('budgets_in_force')
    .select(['budget_id', 'counts', 'limit_micros', 'period'])
    .orderBy('budget_id')
    .execute();

  return rows.map((row) => {
    const parsed = rowSchema.parse(row);

    return {
      id: parsed.budget_id,
      counts: parsed.counts,
      limitMicros: parsed.limit_micros,
      period: parsed.period,
    };
  });
}

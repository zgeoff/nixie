import { budgetPeriods, storedBudgetCountsSchema } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import type { DefinitionBudget, DefinitionsTables } from '../types';

const rowSchema = z.object({
  budget_id: z.string(),
  counts: storedBudgetCountsSchema,
  limit_micros: z.number(),
  period: z.enum(budgetPeriods),
  hash: z.string(),
});

export async function readBudgetsInForce(
  db: Kysely<unknown>,
): Promise<readonly DefinitionBudget[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('budgets_in_force')
    .select(['budget_id', 'counts', 'limit_micros', 'period', 'hash'])
    .orderBy('budget_id')
    .execute();

  return rows.map((row) => {
    const parsed = rowSchema.parse(row);

    return {
      id: parsed.budget_id,
      counts: parsed.counts,
      limitMicros: parsed.limit_micros,
      period: parsed.period,
      hash: parsed.hash,
    };
  });
}

import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { BudgetLimit, BudgetsTables } from '../types';

// Puts a budget in force as the seed does: a row of budgets_in_force.
export async function seedBudgetInForce(writer: Writer, budget: BudgetLimit): Promise<void> {
  await withWriteTransaction(writer, async (tx) => {
    await tx
      .$extendTables<BudgetsTables>()
      .insertInto('budgets_in_force')
      .values({
        budget_id: budget.id,
        counts: budget.counts,
        limit_micros: budget.limitMicros,
        period: budget.period,
        hash: `hash-${budget.id}`,
        updated_sequence: 0,
      })
      .execute();
  });
}

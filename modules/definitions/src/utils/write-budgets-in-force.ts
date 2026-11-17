import type { Transaction } from 'kysely';
import type { DefinitionBudget, DefinitionsTables } from '../types';

export interface BudgetRowWrite {
  readonly budgetID: string;

  // null removes the budget
  readonly after: DefinitionBudget | null;
}

// The rows of the budgets that the seed or an approved proposal put in force. The sequence is the
// record that moved them.
export async function writeBudgetsInForce(
  tx: Transaction<unknown>,
  writes: readonly BudgetRowWrite[],
  sequence: number,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  for (const write of writes) {
    if (write.after === null) {
      await tables.deleteFrom('budgets_in_force').where('budget_id', '=', write.budgetID).execute();

      continue;
    }

    const row = {
      budget_id: write.budgetID,
      counts: write.after.counts,
      limit_micros: write.after.limitMicros,
      period: write.after.period,
      hash: write.after.hash,
      updated_sequence: sequence,
    };

    await tables
      .insertInto('budgets_in_force')
      .values(row)
      .onConflict((conflict) => conflict.column('budget_id').doUpdateSet(row))
      .execute();
  }
}

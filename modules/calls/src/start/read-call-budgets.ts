import { readBudgetStatuses } from '@heynixie/budgets';
import type { BudgetsContext } from '@heynixie/budgets';
import type { Kysely } from 'kysely';
import { callBudgetIDs } from '../utils/call-budget-ids';

// The call budgets in force, each with what its period has spent.
export async function readCallBudgets(
  db: Kysely<unknown>,
  context: BudgetsContext,
): Promise<readonly { readonly spentMicros: number; readonly limitMicros: number }[]> {
  const statuses = await readBudgetStatuses(db, context);

  return statuses.filter((status) => callBudgetIDs.some((id) => id === status.id));
}

import { chargeBudgetsInTransaction } from '@heynixie/budgets';
import type { BudgetReached } from '@heynixie/budgets';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { CallsContext } from '../types';
import { callBudgetIDs } from './call-budget-ids';

export interface CallMinute {
  readonly callID: string;
  readonly pricePerMinuteMicros: number;
}

// Charges one started minute against every call budget, or none of them. The result is the budget
// that has no room for it.
export async function chargeCallMinute(
  tx: Transaction<unknown>,
  context: CallsContext,
  call: CallMinute,
): Promise<BudgetReached | null> {
  const charged = await chargeBudgetsInTransaction(tx, context.budgets, {
    budgetIDs: callBudgetIDs,
    amountMicros: call.pricePerMinuteMicros,
    for: { kind: 'call_minute', id: call.callID },
  });

  if ('error' in charged) {
    invariant(charged.error === 'budget_reached', `the call budgets include ${charged.budgetID}`);

    return charged;
  }

  return null;
}

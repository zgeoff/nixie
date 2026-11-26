import { checkBudgetRoom, formatBudgetRefusal } from '@heynixie/budgets';
import type { WriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { PaidGate, PaidPlan } from './types';

// Checks the call cap and the tool's day and month budgets for the call, and writes nothing. The
// charge follows in the transaction of the result record.
export async function checkPaidPlanInTransaction(
  tx: WriteTransaction,
  plan: PaidPlan,
): Promise<PaidGate> {
  const capCheck = await plan.capCall?.checkInTransaction(tx);

  if (capCheck?.status === 'capped') {
    return { status: 'capped', message: capCheck.message };
  }

  const refusal = await checkBudgetRoom(tx, plan.budgets, {
    budgetIDs: [`${plan.toolName}-day`, `${plan.toolName}-month`],
    amountMicros: plan.priceMicros,
  });

  if (refusal !== null) {
    invariant(refusal.error === 'budget_reached', `the built-in budgets of ${plan.toolName} exist`);

    return { status: 'refused', message: formatBudgetRefusal(refusal) };
  }

  return { status: 'passed' };
}

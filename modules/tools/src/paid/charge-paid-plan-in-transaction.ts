import { chargeBudgetsInTransaction, formatBudgetRefusal } from '@heynixie/budgets';
import type { WriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { PaidGate, PaidPlan } from './types';

// Checks the call cap, charges the tool's day and month budgets and counts the call, all in the
// write transaction that the caller holds. A call that the cap or a budget refuses writes nothing.
export async function chargePaidPlanInTransaction(
  tx: WriteTransaction,
  plan: PaidPlan,
): Promise<PaidGate> {
  const capCheck = await plan.capCall?.checkInTransaction(tx);

  if (capCheck?.status === 'capped') {
    return { status: 'capped', message: capCheck.message };
  }

  const charged = await chargeBudgetsInTransaction(tx, plan.budgets, {
    budgetIDs: [`${plan.toolName}-day`, `${plan.toolName}-month`],
    amountMicros: plan.priceMicros,
    for: { kind: 'tool_call', id: plan.callID },
  });

  if ('error' in charged) {
    invariant(charged.error === 'budget_reached', `the built-in budgets of ${plan.toolName} exist`);

    return { status: 'refused', message: formatBudgetRefusal(charged) };
  }

  await plan.capCall?.countInTransaction(tx);

  return { status: 'passed' };
}

import { chargeBudgetsInTransaction } from '@heynixie/budgets';
import type { ChargeBeside, PaidPlan } from './types';

// The charge of a call that ran: it counts the call and charges the budgets past their room, since
// the call billed already.
export function makePaidPlanCharge(plan: PaidPlan): ChargeBeside {
  return async (tx) => {
    await plan.capCall?.countInTransaction(tx);

    await chargeBudgetsInTransaction(tx, plan.budgets, {
      budgetIDs: [`${plan.toolName}-day`, `${plan.toolName}-month`],
      amountMicros: plan.priceMicros,
      for: { kind: 'tool_call', id: plan.callID },
      overdraw: true,
    });
  };
}

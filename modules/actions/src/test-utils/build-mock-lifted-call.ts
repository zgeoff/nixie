import type { AllowedCall } from '../types';

// A purchase that a rule's lift allowed, charged to the budget `groceries`. The call record is the
// first record of the log, which every test log holds.
export function buildMockLiftedCall(step: AllowedCall['step'], amountMicros: number): AllowedCall {
  return {
    step,
    tool: 'test.buy',
    actionHash: `sha256:buy-${String(amountMicros)}-${step.lease.workID}`,
    arguments: { amount: amountMicros / 1_000_000 },
    decision: {
      outcome: 'allow',
      stage: 4,
      rule: { id: 'weekly-shop', revision: 1 },
      lift: { ruleID: 'weekly-shop', budgetID: 'groceries', amountMicros },
    },
    effects: ['spend'],
    callSequence: 1,
  };
}

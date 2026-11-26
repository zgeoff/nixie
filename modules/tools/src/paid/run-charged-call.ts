import { creditBudgetChargesInTransaction } from '@heynixie/budgets';
import type { Settled } from '../settle/types';
import type { ToolOutcome } from '../types';
import type { CreditBeside, PaidPlan } from './types';

export interface ChargedRun {
  readonly outcome: ToolOutcome;

  // gives the charges back, in the transaction of the result record; null when the charges stand
  readonly credit: CreditBeside | null;
}

// Runs a call whose charge has committed. An error or a refusal code credits the charges, unless
// the provider billed. A throw leaves an unknown outcome, so the charges stand.
export async function runChargedCall(
  plan: PaidPlan,
  run: () => Promise<ToolOutcome>,
): Promise<ChargedRun> {
  const outcome = await run();

  if (!isUnbilledFailure(outcome)) {
    return { outcome, credit: null };
  }

  return {
    outcome,
    credit: (tx) =>
      creditBudgetChargesInTransaction(tx, plan.budgets, {
        for: { kind: 'tool_call', id: plan.callID },
      }),
  };
}

// The result's own write beside the record comes first, so a result the record refuses keeps the
// charges.
export function withCreditBeside(settled: Settled, credit: CreditBeside | null): Settled {
  if (credit === null) {
    return settled;
  }

  const own = settled.writeBeside;

  return {
    ...settled,
    writeBeside: async (tx, resultSequence) => {
      await own?.(tx, resultSequence);
      await credit(tx);
    },
  };
}

export function isUnbilledFailure(outcome: ToolOutcome): boolean {
  if (outcome.status === 'error') {
    return outcome.billed !== true;
  }

  return outcome.refusalCode !== undefined && outcome.billed !== true;
}

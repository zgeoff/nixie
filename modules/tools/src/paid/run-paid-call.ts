import type { BudgetsContext } from '@heynixie/budgets';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { RegisteredTool, ToolOutcome } from '../types';
import { chargePaidPlanInTransaction } from './charge-paid-plan-in-transaction';
import type { PaidCallFacts } from './prepare-paid-call';
import { preparePaidCall } from './prepare-paid-call';
import { runChargedCall } from './run-charged-call';
import type { CreditBeside } from './types';

export interface PaidCallOptions {
  readonly log: Log;

  // the budgets that a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;
}

export type PaidOutcome =
  | ToolOutcome
  | { readonly status: 'budget_reached'; readonly message: string };

export interface PaidRun {
  readonly outcome: PaidOutcome;

  // gives the charges back in the transaction of the result record, or null when they stand
  readonly credit: CreditBeside | null;
}

// Runs the call of an approved action. Its call record is from earlier, so the charge commits in a
// transaction of its own, and a credit commits with the result record.
export async function runPaidCall(
  registered: RegisteredTool,
  facts: PaidCallFacts,
  options: PaidCallOptions,
  run: () => Promise<ToolOutcome>,
): Promise<PaidRun> {
  const prepared = await preparePaidCall(registered, facts, options.budgets);

  if (prepared.status === 'free') {
    return { outcome: await run(), credit: null };
  }

  if (prepared.status === 'ended') {
    return { outcome: prepared.outcome, credit: null };
  }

  const plan = prepared.plan;

  try {
    const gate = await withWriteTransaction(options.log.writer, (tx) =>
      chargePaidPlanInTransaction(tx, plan),
    );

    if (gate.status === 'capped') {
      plan.release();

      return { outcome: { status: 'error', message: gate.message }, credit: null };
    }

    if (gate.status === 'refused') {
      plan.release();

      return { outcome: { status: 'budget_reached', message: gate.message }, credit: null };
    }
  } catch (error) {
    plan.release();
    throw error;
  }

  return runChargedCall(plan, run);
}

import type { BudgetsContext } from '@heynixie/budgets';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { RegisteredTool, ToolOutcome } from '../types';
import { checkPaidPlanInTransaction } from './check-paid-plan-in-transaction';
import { makePaidPlanCharge } from './make-paid-plan-charge';
import type { PaidCallFacts } from './prepare-paid-call';
import { preparePaidCall } from './prepare-paid-call';
import { isUnbilledFailure } from './run-charged-call';
import type { ChargeBeside } from './types';

export interface PaidCallOptions {
  readonly log: Log;

  // the budgets that a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;
}

type PaidOutcome = ToolOutcome | { readonly status: 'budget_reached'; readonly message: string };

export interface PaidRun {
  readonly outcome: PaidOutcome;

  // charges the call in the transaction of the result record, or null when the call stands free
  readonly charge: ChargeBeside | null;
}

// Runs the call of an approved action. Its call record is from earlier, so the budgets are checked
// before the run and the charge commits with the result record. An unbilled error or refusal
// charges nothing, and a throw leaves an unknown outcome, so the charge stands.
export async function runPaidCall(
  registered: RegisteredTool,
  facts: PaidCallFacts,
  options: PaidCallOptions,
  run: () => Promise<ToolOutcome>,
): Promise<PaidRun> {
  const prepared = await preparePaidCall(registered, facts, options.budgets);

  if (prepared.status === 'free') {
    return { outcome: await run(), charge: null };
  }

  if (prepared.status === 'ended') {
    return { outcome: prepared.outcome, charge: null };
  }

  const plan = prepared.plan;

  try {
    const gate = await withWriteTransaction(options.log.writer, (tx) =>
      checkPaidPlanInTransaction(tx, plan),
    );

    if (gate.status === 'capped') {
      plan.release();

      return { outcome: { status: 'error', message: gate.message }, charge: null };
    }

    if (gate.status === 'refused') {
      plan.release();

      return { outcome: { status: 'budget_reached', message: gate.message }, charge: null };
    }
  } catch (error) {
    plan.release();
    throw error;
  }

  const outcome = await run().catch((error: unknown): ToolOutcome => ({
    status: 'error',
    message: `the tool ${registered.definition.name} failed: ${String(error)}`,
    billed: true,
  }));

  return { outcome, charge: isUnbilledFailure(outcome) ? null : makePaidPlanCharge(plan) };
}

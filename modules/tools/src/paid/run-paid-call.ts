import {
  chargeBudgetsInTransaction,
  creditBudgetChargesInTransaction,
  formatBudgetReached,
} from '@heynixie/budgets';
import type { BudgetsContext } from '@heynixie/budgets';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { RegisteredTool, ToolCall, ToolOutcome } from '../types';

export interface PaidCallOptions {
  readonly log: Log;

  // the budgets that a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;
}

export type PaidOutcome =
  | ToolOutcome
  | { readonly status: 'budget_reached'; readonly message: string };

// The charge lands before the provider sees the call, in the transaction that checks and counts the
// tool's call cap. An error credits the charges unless it says the provider billed, and a throw
// leaves an unknown outcome, so they stand. The cap's count is never credited.
export async function runPaidCall(
  registered: RegisteredTool,
  call: ToolCall,
  options: PaidCallOptions,
  run: () => Promise<ToolOutcome>,
): Promise<PaidOutcome> {
  const paid = registered.definition.paid;

  if (paid === undefined) {
    return run();
  }

  const budgets = options.budgets;

  invariant(budgets, `the paid tool ${registered.definition.name} needs the budgets of the server`);

  const name = registered.definition.name;
  const target = { for: { kind: 'tool_call' as const, id: call.callID } };
  const capCall = paid.callCap?.openCall();

  const gate = await withWriteTransaction(options.log.writer, async (tx) => {
    const capCheck = await capCall?.checkInTransaction(tx);

    if (capCheck?.status === 'capped') {
      return { status: 'capped' as const, message: capCheck.message };
    }

    const charged = await chargeBudgetsInTransaction(tx, budgets, {
      budgetIDs: [`${name}-day`, `${name}-month`],
      amountMicros: paid.priceMicros,
      for: target.for,
    });

    if ('error' in charged) {
      return { status: 'refused' as const, charged };
    }

    await capCall?.countInTransaction(tx);

    return { status: 'passed' as const };
  });

  if (gate.status === 'capped') {
    return { status: 'error', message: gate.message };
  }

  if (gate.status === 'refused') {
    invariant(gate.charged.error === 'budget_reached', `the built-in budgets of ${name} exist`);

    return { status: 'budget_reached', message: formatBudgetReached(gate.charged) };
  }

  const outcome = await run();

  if (outcome.status === 'error' && outcome.billed !== true) {
    await withWriteTransaction(options.log.writer, (tx) =>
      creditBudgetChargesInTransaction(tx, budgets, target),
    );
  }

  return outcome;
}

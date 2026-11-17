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

// The charge lands before the provider sees the call. A tool that answers with an error did not
// spend, so its charges are credited. A tool that throws leaves an unknown outcome, so they stand.
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

  const charged = await withWriteTransaction(options.log.writer, (tx) =>
    chargeBudgetsInTransaction(tx, budgets, {
      budgetIDs: [`${name}-day`, `${name}-month`],
      amountMicros: paid.priceMicros,
      for: target.for,
    }),
  );

  if ('error' in charged) {
    invariant(charged.error === 'budget_reached', `the built-in budgets of ${name} exist`);

    return { status: 'budget_reached', message: formatBudgetReached(charged) };
  }

  const outcome = await run();

  if (outcome.status === 'error') {
    await withWriteTransaction(options.log.writer, (tx) =>
      creditBudgetChargesInTransaction(tx, budgets, target),
    );
  }

  return outcome;
}

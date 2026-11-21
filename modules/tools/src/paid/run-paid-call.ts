import {
  chargeBudgetsInTransaction,
  creditBudgetChargesInTransaction,
  formatBudgetReached,
} from '@heynixie/budgets';
import type { BudgetsContext } from '@heynixie/budgets';
import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { isPriceMicros } from '../build-tool-registry';
import type { RegisteredTool, ToolCall, ToolOutcome, ToolRun } from '../types';

export interface PaidCallOptions {
  readonly log: Log;

  // the budgets that a paid tool charges; a deployment with a paid tool sets it
  readonly budgets?: BudgetsContext;
}

export interface PaidCallFacts {
  readonly call: ToolCall;
  readonly run: ToolRun;
}

export type PaidOutcome =
  | ToolOutcome
  | { readonly status: 'budget_reached'; readonly message: string };

// A check that refuses charges nothing. The charge lands before the provider sees the call, in the
// transaction that checks and counts the tool's call cap. An error or a refusalCode credits it,
// unless the provider billed, and a throw leaves an unknown outcome, so it stands.
export async function runPaidCall(
  registered: RegisteredTool,
  facts: PaidCallFacts,
  options: PaidCallOptions,
  run: () => Promise<ToolOutcome>,
): Promise<PaidOutcome> {
  const paid = registered.definition.paid;
  const call = facts.call;

  if (paid === undefined) {
    return run();
  }

  const budgets = options.budgets;

  invariant(budgets, `the paid tool ${registered.definition.name} needs the budgets of the server`);

  const name = registered.definition.name;

  const refusal = await paid.check?.(call.input, { run: facts.run });

  if (refusal !== undefined && refusal !== null) {
    return { status: 'ok', ...refusal };
  }

  const priceMicros =
    typeof paid.priceMicros === 'number' ? paid.priceMicros : await paid.priceMicros(call.input);

  invariant(isPriceMicros(priceMicros), `the paid tool ${name} priced a call at ${priceMicros}`);

  const target = { for: { kind: 'tool_call' as const, id: call.callID } };
  const capCall = paid.callCap?.openCall();

  const gate = await withWriteTransaction(options.log.writer, async (tx) => {
    const capCheck = await capCall?.checkInTransaction(tx);

    if (capCheck?.status === 'capped') {
      return { status: 'capped' as const, message: capCheck.message };
    }

    const charged = await chargeBudgetsInTransaction(tx, budgets, {
      budgetIDs: [`${name}-day`, `${name}-month`],
      amountMicros: priceMicros,
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

  if (isUnbilledFailure(outcome)) {
    await withWriteTransaction(options.log.writer, (tx) =>
      creditBudgetChargesInTransaction(tx, budgets, target),
    );
  }

  return outcome;
}

function isUnbilledFailure(outcome: ToolOutcome): boolean {
  if (outcome.status === 'error') {
    return outcome.billed !== true;
  }

  return outcome.refusalCode !== undefined && outcome.billed !== true;
}

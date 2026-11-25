import type { BudgetsContext } from '@heynixie/budgets';
import invariant from 'tiny-invariant';
import { isPriceMicros } from '../build-tool-registry';
import type { RegisteredTool, ToolCall, ToolRun } from '../types';
import type { PaidPreparation } from './types';

export interface PaidCallFacts {
  readonly call: ToolCall;
  readonly run: ToolRun;
}

// Runs the tool's check and prices the call. A check that refuses ends the call and charges
// nothing. A tool that is not paid gets no plan.
export async function preparePaidCall(
  registered: RegisteredTool,
  facts: PaidCallFacts,
  budgets: BudgetsContext | undefined,
): Promise<PaidPreparation> {
  const paid = registered.definition.paid;

  if (paid === undefined) {
    return { status: 'free' };
  }

  const name = registered.definition.name;
  const call = facts.call;

  invariant(budgets, `the paid tool ${name} needs the budgets of the server`);

  const context = { run: facts.run, callID: call.callID };

  const refusal = await paid.check?.(call.input, context);

  if (refusal !== undefined && refusal !== null) {
    return { status: 'ended', outcome: { status: 'ok', ...refusal } };
  }

  try {
    const priceMicros =
      typeof paid.priceMicros === 'number' ? paid.priceMicros : await paid.priceMicros(call.input);

    invariant(isPriceMicros(priceMicros), `the paid tool ${name} priced a call at ${priceMicros}`);

    return {
      status: 'plan',
      plan: {
        toolName: name,
        budgets,
        priceMicros,
        callID: call.callID,
        capCall: paid.callCap?.openCall(),
        release: () => paid.release?.(context),
      },
    };
  } catch (error) {
    paid.release?.(context);
    throw error;
  }
}

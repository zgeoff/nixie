import type { BudgetsContext } from '@heynixie/budgets';
import type { PolicyDecision } from '@heynixie/policy';
import { isMemoryRuleAsk } from '../policy-call/build-memory-verdict';
import type { RegisteredTool, ToolCall, ToolRun } from '../types';
import { preparePaidCall } from './prepare-paid-call';
import type { PaidPreparation } from './types';

export type PaidState = PaidPreparation | { readonly status: 'failed'; readonly error: unknown };

interface PaidFacts {
  readonly policy: PolicyDecision;
  readonly registered: RegisteredTool | null;
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly budgets: BudgetsContext | undefined;
}

// Only a call that the policy lets run, on a tool that runs inside the turn, charges. The check and
// the price come first, because the charge lands in the transaction that writes the call record.
export async function tryPreparePaidCall(facts: PaidFacts): Promise<PaidState> {
  const policy = facts.policy;
  const registered = facts.registered;
  const isAsk = policy.decision.outcome === 'ask' && !isMemoryRuleAsk(policy);

  if (
    registered === null ||
    registered.definition.paid === undefined ||
    registered.definition.execution !== 'direct' ||
    isAsk ||
    policy.decision.outcome === 'deny'
  ) {
    return { status: 'free' };
  }

  try {
    const prepared = await preparePaidCall(
      registered,
      { call: facts.call, run: facts.run },
      facts.budgets,
    );

    return prepared;
  } catch (error) {
    return { status: 'failed', error };
  }
}

import type { PolicyDecision } from '@heynixie/policy';
import type { ActionQueue, OpenRepeat, RegisteredTool, ToolCall, ToolRun } from '../types';
import { isMemoryRuleAsk } from './build-memory-verdict';

export interface AskedRepeat {
  readonly registered: RegisteredTool | null;
  readonly policy: PolicyDecision;
  readonly call: ToolCall;
  readonly run: ToolRun;
  readonly queue: ActionQueue;
  readonly actionHash: string;
}

// A call that asks again while its earlier approved action is still open is a repeat of that
// action, whichever way the tool runs, so it proposes nothing and reports the action's own status.
export function readAskedRepeat(asked: AskedRepeat): Promise<OpenRepeat | null> {
  const isAsk = asked.policy.decision.outcome === 'ask' && !isMemoryRuleAsk(asked.policy);

  if (!isAsk || asked.registered === null) {
    return Promise.resolve(null);
  }

  return asked.queue.readOpenRepeat({
    run: asked.run,
    tool: asked.call.tool,
    input: asked.call.input,
    actionHash: asked.actionHash,
  });
}

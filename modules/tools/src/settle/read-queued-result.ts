import type { ActionQueue, RegisteredTool } from '../types';
import { buildMessage } from './build-message';
import { buildTypedResult } from './build-typed-result';
import type { Settled } from './types';

export interface QueuedWait {
  readonly actionID: string;
  readonly timeoutMs: number;
}

export async function readQueuedResult(
  registered: RegisteredTool,
  queue: Pick<ActionQueue, 'waitForOutcome'>,
  wait: QueuedWait,
): Promise<Settled> {
  const actionID = wait.actionID;

  const outcome = await queue.waitForOutcome(actionID, wait.timeoutMs).catch(() => null);

  if (outcome === null) {
    return buildMessage('queued', `queued as ${actionID}`, { isError: false, actionID });
  }

  if (outcome.outcome === 'done') {
    return buildTypedResult(registered, outcome, actionID);
  }

  // The record codec lists no cancel, so the result record keeps it under failed and the text names it.
  const recorded = outcome.outcome === 'cancelled' ? 'failed' : outcome.outcome;

  return buildMessage(recorded, `action ${actionID} ${outcome.outcome}: ${outcome.reason}`, {
    source: 'untrusted',
    isError: false,
    actionID,
  });
}

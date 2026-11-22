import type { ActionQueue, RegisteredTool, ToolImage } from '../types';
import { buildMessage } from './build-message';
import { buildTypedResult } from './build-typed-result';
import type { Settled } from './types';

export interface QueuedWait {
  readonly actionID: string;
  readonly timeoutMs: number;

  // the session's image budget; absent, every picture is shown
  readonly reserveImages?: ((images: readonly ToolImage[]) => boolean) | undefined;
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
    // a picture past the session's image budget is left out, as a direct tool's is
    const images = outcome.images ?? [];
    const isShown = images.length === 0 || (wait.reserveImages?.(images) ?? true);
    const shown = isShown ? outcome : { result: outcome.result };

    return buildTypedResult(registered, shown, actionID);
  }

  // The record codec lists no cancel, so the result record keeps it under failed and the text names it.
  const recorded = outcome.outcome === 'cancelled' ? 'failed' : outcome.outcome;

  return buildMessage(recorded, `action ${actionID} ${outcome.outcome}: ${outcome.reason}`, {
    source: 'untrusted',
    isError: false,
    actionID,
  });
}

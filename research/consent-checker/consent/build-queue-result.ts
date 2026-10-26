import type { QueueOutput, QueueResult } from './run-budgeted-queue.ts';
import { noOutputFailure } from './types.ts';

// An output with no answer still adds its cost, so the spend stays right, and it stops the run.
export function buildQueueResult(result: QueueResult, output: QueueOutput): QueueResult {
  const costUSD = result.costUSD + (output.costUSD ?? 0);

  if (output.failure !== noOutputFailure) {
    return { ...result, costUSD, ran: result.ran + 1 };
  }

  return {
    ...result,
    costUSD,
    isStoppedByFailure: true,
    ...(output.failureReason === undefined ? {} : { failureReason: output.failureReason }),
  };
}

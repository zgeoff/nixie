import type { QueueOutput, QueueResult } from './run-budgeted-queue.ts';
import { noOutputFailure } from './types.ts';

// An output's cost replaces the reservation its call held, and an output with no known cost keeps
// it. An output with no answer still counts its cost, and it stops the run.
export function buildQueueResult(
  result: QueueResult,
  output: QueueOutput,
  reserveUSD: number,
): QueueResult {
  const costUSD = result.costUSD - reserveUSD + (output.costUSD ?? reserveUSD);

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

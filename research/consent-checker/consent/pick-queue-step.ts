import type { QueueResult } from './run-budgeted-queue.ts';

export interface QueueState {
  result: QueueResult;
  started: number;
  hasErrored: boolean;
}

export interface QueueLimits {
  reserveUSD: number;
  budgetUSD: number;
  limit: number | null;
}

export interface QueueStep {
  isStarting: boolean;
  isStoppedAtBudget: boolean;
}

// Whether a worker starts its next item. A worker error, an output with no answer or the run's limit
// stops the run before the budget does, so only a run that stops for its spend reports the budget. An
// item starts only while its reservation fits in what the budget leaves, because it can cost that much.
export function pickQueueStep(state: QueueState, limits: QueueLimits): QueueStep {
  if (
    state.hasErrored ||
    state.result.isStoppedByFailure ||
    (limits.limit !== null && state.started >= limits.limit)
  ) {
    return { isStarting: false, isStoppedAtBudget: false };
  }

  if (
    state.result.costUSD >= limits.budgetUSD ||
    state.result.costUSD + limits.reserveUSD > limits.budgetUSD
  ) {
    return { isStarting: false, isStoppedAtBudget: true };
  }

  return { isStarting: true, isStoppedAtBudget: false };
}

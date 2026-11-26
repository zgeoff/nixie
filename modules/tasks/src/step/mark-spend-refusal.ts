import { spendRefusals } from './spend-refusals';

// A step that the gateway refused at its route's limit failed because of the limit, even when the
// route's stop has cleared by the time the runner reads it. The step marks that failure, so a runner
// retries the step and counts no step error.
export function markSpendRefusal(error: unknown): void {
  if (typeof error === 'object' && error !== null) {
    spendRefusals.add(error);
  }
}

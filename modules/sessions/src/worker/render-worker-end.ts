import { match } from 'ts-pattern';
import { renderWorkerUsed } from './render-worker-used';
import type { WorkerEnd, WorkerPlan } from './types';
import type { WorkerUsed } from './worker-used';

export interface WorkerEndView {
  readonly shortID: string;
  readonly used: WorkerUsed;
  readonly limits: WorkerPlan['limits'];
  readonly isTaskLimit: boolean;
}

// The call's error sentence for a worker run that gave no answer. A run that the calling step's
// signal aborted has none, because its call rejects.
export function renderWorkerEnd(
  end: Exclude<WorkerEnd, { outcome: 'answered' | 'aborted' }>,
  view: WorkerEndView,
): string {
  const used = renderWorkerUsed(view.used);
  const id = view.shortID;

  return match(end)
    .with({ outcome: 'limit' }, (limited) => {
      const stop =
        limited.limit === 'dollars' && view.isTaskLimit
          ? `stopped because this task has $${view.limits.dollars.toFixed(2)} left of its dollar limit`
          : `stopped at its ${limited.limit} limit of ${renderLimitMax(limited.limit, view.limits)}`;

      return `The worker ${id} ${stop} and gave no answer. ${used} Ask a narrower question, or do the work yourself.`;
    })
    .with(
      { outcome: 'sandbox_failed' },
      () =>
        `The worker ${id} could not start its sandbox. ${used} A second call starts a new worker.`,
    )
    .with(
      { outcome: 'model_failed' },
      (failed) =>
        `The worker ${id}'s model call failed: ${failed.detail.replace(/\.$/u, '')}. ${used}`,
    )
    .with({ outcome: 'no_answer' }, () => `The worker ${id} ended with no answer. ${used}`)
    .with(
      { outcome: 'interrupted' },
      () => `The worker ${id} stopped because this turn was interrupted. ${used}`,
    )
    .exhaustive();
}

function renderLimitMax(
  limit: 'minutes' | 'turns' | 'tokens' | 'dollars',
  limits: WorkerPlan['limits'],
): string {
  return limit === 'dollars' ? `$${limits.dollars.toFixed(2)}` : String(limits[limit]);
}

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
      const stop = pickLimitStop(limited.limit, view);

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

// A dollar limit names no figure: the model reads no dollar amount, limit or rate.
function pickLimitStop(
  limit: 'minutes' | 'turns' | 'tokens' | 'dollars',
  view: WorkerEndView,
): string {
  if (limit === 'dollars') {
    return view.isTaskLimit
      ? 'stopped because this task reached its dollar limit'
      : 'stopped at its dollar limit';
  }

  return `stopped at its ${limit} limit of ${String(view.limits[limit])}`;
}

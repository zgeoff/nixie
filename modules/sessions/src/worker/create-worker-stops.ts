import type { Clock } from '@heynixie/clock';
import type { WorkerPlan } from './types';

type SpendLimit = 'tokens' | 'dollars';

export interface WorkerStops {
  // a hard stop: the calling step lost its lease or was ended, or the minutes ran out. It ends the
  // guest at once.
  readonly hard: AbortSignal;

  // a soft stop: the calling turn was interrupted or reached its budget, or the worker's own spend
  // reached a limit. It lets the guest end its current model call.
  readonly interrupt: AbortSignal;

  readonly isMinutesUp: () => boolean;

  // stops the guest at the end of its call, because the worker's spend reached the limit
  readonly trip: (limit: SpendLimit) => void;
  readonly getTripped: () => SpendLimit | null;

  // frees the timer, and is safe to call again
  readonly close: () => void;
}

// The minutes count from the call, so the timer starts at the time the plan holds.
export function createWorkerStops(clock: Clock, plan: WorkerPlan): WorkerStops {
  const minutes = new AbortController();
  const spend = new AbortController();
  const closed = new AbortController();

  const state: { isMinutesUp: boolean; tripped: SpendLimit | null } = {
    isMinutesUp: false,
    tripped: null,
  };

  const remainingMs = Math.max(0, plan.limits.minutes * 60_000 - (clock.now() - plan.calledAt));

  const waitForMinutes = async (): Promise<void> => {
    await clock.sleep(remainingMs, closed.signal);

    // A sleep that its signal cut short resolves too, so the close tells the two apart.
    if (!closed.signal.aborted) {
      state.isMinutesUp = true;

      minutes.abort(new Error(`the worker's ${String(plan.limits.minutes)} minutes ran out`));
    }
  };

  void waitForMinutes();

  return {
    hard: AbortSignal.any([plan.hold.signal, minutes.signal]),
    interrupt: AbortSignal.any([plan.hold.interrupt, spend.signal]),
    isMinutesUp: () => state.isMinutesUp,
    trip: (limit) => {
      state.tripped ??= limit;

      spend.abort();
    },
    getTripped: () => state.tripped,
    close: () => {
      closed.abort();
    },
  };
}

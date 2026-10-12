import { waitFor } from '@testing-library/react';
import invariant from 'tiny-invariant';

export interface StubTimer {
  // starts a timer as the platform's setTimeout does, and returns its stop
  readonly startTimer: (onTimeout: () => void, ms: number) => () => void;

  // moves time forward and fires every timer whose due time it passed, earliest first, including
  // the timers that those callbacks start
  readonly advance: (ms: number) => void;

  // waits until a timer is pending, moves time to the earliest one's due time and fires it, and
  // resolves with how long that timer waited
  readonly advanceToNext: () => Promise<number>;

  // how many timers are waiting to fire
  readonly countPending: () => number;
}

interface PendingTimer {
  readonly dueAt: number;
  readonly onTimeout: () => void;
  readonly startedAt: number;
}

// Stands in for the platform timer, so a test moves time forward instead of waiting for it. A timer
// fires once, and a stopped timer never fires.
export function buildStubTimer(): StubTimer {
  const state = { now: 0 };
  const pending = new Set<PendingTimer>();
  const runTimersFor = (ms: number): void => {
    const target = state.now + ms;
    let next = findEarliestDue([...pending], target);

    // Time steps to each due time in turn, so a timer that a callback starts counts from the
    // moment it fired and fires in this advance when it falls due by the target. An earlier
    // callback can stop a later timer, which then stays unfired.
    while (next !== undefined) {
      state.now = next.dueAt;
      pending.delete(next);
      next.onTimeout();
      next = findEarliestDue([...pending], target);
    }

    state.now = target;
  };

  return {
    startTimer: (onTimeout, ms) => {
      const timer: PendingTimer = { dueAt: state.now + ms, onTimeout, startedAt: state.now };

      pending.add(timer);
      return () => {
        pending.delete(timer);
      };
    },
    advance: runTimersFor,
    advanceToNext: async () => {
      // code under test often starts its next timer only after a promise settles
      await waitFor(() => {
        if (pending.size === 0) {
          throw new Error('no timer is pending');
        }
      });

      const next = findEarliestDue([...pending], Number.POSITIVE_INFINITY);

      invariant(next);
      runTimersFor(next.dueAt - state.now);

      return next.dueAt - next.startedAt;
    },
    countPending: () => pending.size,
  };
}

// The pending timer due soonest and no later than the target; of two due at once, the one started
// first, as the sort keeps the order they started in.
function findEarliestDue(
  pending: readonly PendingTimer[],
  target: number,
): PendingTimer | undefined {
  return pending
    .filter((timer) => timer.dueAt <= target)
    .toSorted((a, b) => a.dueAt - b.dueAt)
    .at(0);
}

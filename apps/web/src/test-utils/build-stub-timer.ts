import { waitFor } from '@testing-library/react';
import invariant from 'tiny-invariant';

export interface StubTimer {
  readonly startTimer: (onTimeout: () => void, delayMs: number) => () => void;

  readonly advance: (durationMs: number) => void;

  readonly advanceToNext: () => Promise<number>;

  readonly countPending: () => number;
}

interface PendingTimer {
  readonly dueAt: number;
  readonly onTimeout: () => void;
  readonly startedAt: number;
}

export function buildStubTimer(): StubTimer {
  const state = { now: 0 };

  const pending = new Set<PendingTimer>();

  const runTimersFor = (durationMs: number): void => {
    const target = state.now + durationMs;
    let next = findEarliestDue([...pending], target);

    while (next !== undefined) {
      state.now = next.dueAt;

      pending.delete(next);
      next.onTimeout();

      next = findEarliestDue([...pending], target);
    }

    state.now = target;
  };

  return {
    startTimer: (onTimeout, delayMs) => {
      const timer: PendingTimer = { dueAt: state.now + delayMs, onTimeout, startedAt: state.now };

      pending.add(timer);

      return () => {
        pending.delete(timer);
      };
    },
    advance: runTimersFor,
    advanceToNext: async () => {
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

function findEarliestDue(
  pending: readonly PendingTimer[],
  target: number,
): PendingTimer | undefined {
  return pending
    .filter((timer) => timer.dueAt <= target)
    .toSorted((first, second) => first.dueAt - second.dueAt)
    .at(0);
}

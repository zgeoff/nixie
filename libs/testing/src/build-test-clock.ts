import type { Clock } from '@heynixie/clock';

// The clock a test sets and advances, so leases, timers and retry delays pass without a sleep.
export interface TestClock extends Clock {
  // moves time forward and wakes every sleeper whose due time it passed, earliest first
  readonly advance: (durationMs: number) => void;

  // how many sleeps are waiting, so a test advances only once the code it drives sleeps
  readonly countSleepers: () => number;
}

interface Sleeper {
  readonly dueAt: number;
  readonly stop: () => void;
}

// Builds a test clock that starts at startMs. A sleep resolves when an advance reaches its due time
// or when its signal aborts, as the system clock's sleep does; a sleep of no time resolves at once.
export function buildTestClock(startMs: number): TestClock {
  const state = { now: startMs };

  const sleepers = new Set<Sleeper>();

  return {
    now: () => state.now,
    sleep: async (durationMs, signal) => {
      if (signal?.aborted === true || durationMs <= 0) {
        return;
      }

      const sleep = Promise.withResolvers<void>();

      const sleeper: Sleeper = {
        dueAt: state.now + durationMs,
        stop: () => {
          sleepers.delete(sleeper);
          signal?.removeEventListener('abort', sleeper.stop);
          sleep.resolve();
        },
      };

      sleepers.add(sleeper);
      signal?.addEventListener('abort', sleeper.stop, { once: true });

      await sleep.promise;
    },
    advance: (durationMs) => {
      state.now += durationMs;

      const due = [...sleepers]
        .filter((sleeper) => sleeper.dueAt <= state.now)
        .toSorted((first, second) => first.dueAt - second.dueAt);

      for (const sleeper of due) {
        sleeper.stop();
      }
    },
    countSleepers: () => sleepers.size,
  };
}

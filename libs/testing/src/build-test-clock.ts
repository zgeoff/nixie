import type { Clock } from '@heynixie/clock';

export interface TestClock extends Clock {
  readonly advance: (durationMs: number) => void;

  readonly countSleepers: () => number;
}

interface Sleeper {
  readonly dueAt: number;
  readonly stop: () => void;
}

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

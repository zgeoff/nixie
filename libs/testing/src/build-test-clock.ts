// The clock a test sets and advances, so leases, timers and retry delays pass without a sleep. It
// has the shape of the Clock that modules/tasks reads; a lib cannot import a module's type.
export interface TestClock {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;

  // moves time forward and wakes every sleeper whose due time it passed, earliest first
  readonly advance: (ms: number) => void;

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
    sleep: async (ms, signal) => {
      if (signal?.aborted === true || ms <= 0) {
        return;
      }
      const sleep = Promise.withResolvers<void>();
      const sleeper: Sleeper = {
        dueAt: state.now + ms,
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
    advance: (ms) => {
      state.now += ms;

      const due = [...sleepers]
        .filter((sleeper) => sleeper.dueAt <= state.now)
        .toSorted((a, b) => a.dueAt - b.dueAt);

      for (const sleeper of due) {
        sleeper.stop();
      }
    },
    countSleepers: () => sleepers.size,
  };
}

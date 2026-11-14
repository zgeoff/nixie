import type { Clock } from '@heynixie/clock';

export interface Interval {
  readonly stop: () => Promise<void>;
}

export interface IntervalOptions {
  readonly clock: Clock;
  readonly intervalMs: number;
  readonly run: () => Promise<void>;
  readonly onError: (error: unknown) => void;
}

// Runs `run` each intervalMs on the injected clock. The first run comes after one interval, and a
// run that throws goes to onError and the loop goes on.
export function startInterval(options: IntervalOptions): Interval {
  const stopped = new AbortController();

  const loop = (async () => {
    while (!stopped.signal.aborted) {
      await options.clock.sleep(options.intervalMs, stopped.signal);

      if (stopped.signal.aborted) {
        break;
      }

      try {
        await options.run();
      } catch (error) {
        options.onError(error);
      }
    }
  })();

  return {
    stop: async () => {
      stopped.abort();

      await loop;
    },
  };
}

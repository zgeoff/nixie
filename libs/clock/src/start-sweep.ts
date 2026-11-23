import type { Clock } from './types';

export interface SweepOptions {
  readonly clock: Clock;

  readonly intervalMs: number;

  readonly run: () => Promise<unknown>;

  readonly onError: (error: unknown) => void;

  // Runs once at once when true. The first run comes one interval after the start when false.
  readonly runOnStart?: boolean;
}

export interface Sweep {
  // Runs now when the sweep sleeps, or once more after the run in flight.
  readonly wake: () => void;

  // Cuts the sleep short and resolves once the run in flight ends.
  readonly stop: () => Promise<void>;
}

// Runs `run` in a loop on the injected clock. The next run starts one interval after the last run
// ends, so runs never overlap. A run that throws goes to onError, and the loop goes on.
export function startSweep(options: SweepOptions): Sweep {
  const stopped = new AbortController();

  let sleeping: AbortController | null = null;
  let isWoken = options.runOnStart ?? false;

  const loop = (async () => {
    while (!stopped.signal.aborted) {
      if (!isWoken) {
        const sleep = new AbortController();

        sleeping = sleep;

        await options.clock.sleep(
          options.intervalMs,
          AbortSignal.any([stopped.signal, sleep.signal]),
        );

        sleeping = null;

        if (stopped.signal.aborted) {
          break;
        }
      }

      isWoken = false;

      try {
        await options.run();
      } catch (error) {
        reportFailure(options.onError, error);
      }
    }
  })();

  return {
    wake: () => {
      if (stopped.signal.aborted) {
        return;
      }

      if (sleeping === null) {
        isWoken = true;
      } else {
        sleeping.abort();
      }
    },
    stop: async () => {
      stopped.abort();

      await loop;
    },
  };
}

function reportFailure(onError: (error: unknown) => void, error: unknown): void {
  try {
    onError(error);
  } catch {
    // A throw from onError loses only its own report, and the loop goes on.
  }
}

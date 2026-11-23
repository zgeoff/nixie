import type { Clock } from './types';

export interface SweepOptions {
  readonly clock: Clock;
  readonly intervalMs: number;
  readonly run: () => Promise<unknown>;
  readonly onError: (error: unknown) => void;
  readonly runOnStart?: boolean;
}

export interface Sweep {
  readonly wake: () => void;
  readonly stop: () => Promise<void>;
}

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
    // onError's own failure must not end the loop.
  }
}

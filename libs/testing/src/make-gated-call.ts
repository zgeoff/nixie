export interface GatedCallOptions {
  // how long each call waits after the release before it calls through
  readonly delayMs?: number;
}

export interface GatedCall<Args extends readonly unknown[], Result> {
  // holds each call until the release, then calls through to the wrapped function
  readonly call: (...args: Args) => Promise<Result>;

  // lets every held call and every later one through
  readonly release: () => void;

  // settles once the first call arrives
  readonly started: Promise<void>;

  // the calls that have arrived and not yet settled
  readonly countRunning: () => number;

  // the most calls that were running at one time
  readonly countMostRunning: () => number;
}

// Wraps a call so a test can place it in time: each call waits at a gate the test opens, and the
// wrapper counts how many calls run at once, so a test can measure the unit's concurrency.
export function makeGatedCall<Args extends readonly unknown[], Result>(
  callThrough: (...args: Args) => Result | Promise<Result>,
  options: GatedCallOptions = {},
): GatedCall<Args, Result> {
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  const running = { now: 0, most: 0 };

  return {
    call: async (...args) => {
      running.now += 1;
      running.most = Math.max(running.most, running.now);
      started.resolve();

      try {
        await gate.promise;
        if (options.delayMs !== undefined) {
          await Bun.sleep(options.delayMs);
        }
        return await callThrough(...args);
      } finally {
        running.now -= 1;
      }
    },
    release: () => {
      gate.resolve();
    },
    started: started.promise,
    countRunning: () => running.now,
    countMostRunning: () => running.most,
  };
}

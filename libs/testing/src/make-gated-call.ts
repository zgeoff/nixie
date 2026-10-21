export interface GatedCallOptions {
  readonly delayMs?: number;
}

export interface GatedCall<Args extends readonly unknown[], Result> {
  readonly call: (...args: Args) => Promise<Result>;

  readonly release: () => void;

  readonly started: Promise<void>;

  readonly countRunning: () => number;

  readonly countMostRunning: () => number;
}

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

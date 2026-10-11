import type { Clock } from './types';

// The release clock: the wall clock, and a timer sleep that ends early, without an error, when its
// signal aborts, so a stopping loop never waits out a poll.
export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: async (ms, signal) => {
    if (signal?.aborted === true) {
      return;
    }
    const sleep = Promise.withResolvers<void>();
    const timer: { id?: ReturnType<typeof setTimeout> } = {};
    const stopSleep = (): void => {
      clearTimeout(timer.id);
      signal?.removeEventListener('abort', stopSleep);
      sleep.resolve();
    };

    timer.id = setTimeout(stopSleep, ms);
    signal?.addEventListener('abort', stopSleep, { once: true });
    await sleep.promise;
  },
};

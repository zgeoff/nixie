import type { Clock } from './types';

export const systemClock: Clock = {
  now: () => Date.now(),
  sleep: async (durationMs, signal) => {
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

    timer.id = setTimeout(stopSleep, durationMs);
    signal?.addEventListener('abort', stopSleep, { once: true });

    await sleep.promise;
  },
};

import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkTracker as ClockWorkTracker } from '@heynixie/clock';

export interface WorkTracker extends ClockWorkTracker {
  readonly runParked: <T>(wait: () => Promise<T>) => Promise<T>;

  readonly isSettled: () => boolean;
}

interface Work {
  parked: number;
}

export function buildWorkTracker(): WorkTracker {
  const current = new AsyncLocalStorage<Work>();
  const running = new Set<Work>();

  return {
    runWork: async (work) => {
      const entry: Work = { parked: 0 };

      running.add(entry);

      try {
        return await current.run(entry, work);
      } finally {
        running.delete(entry);
      }
    },
    runParked: async (wait) => {
      const entry = current.getStore();

      if (entry === undefined) {
        return wait();
      }

      entry.parked += 1;

      try {
        return await wait();
      } finally {
        entry.parked -= 1;
      }
    },
    isSettled: () => [...running].every((entry) => entry.parked > 0),
  };
}

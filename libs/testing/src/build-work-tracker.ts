import { AsyncLocalStorage } from 'node:async_hooks';
import type { WorkTracker as ClockWorkTracker } from '@heynixie/clock';
import { machineTypes } from '@zgeoff/std';
import type { ActorRefFrom } from 'xstate';
import { assign, createActor, setup } from 'xstate';

export interface WorkTracker extends ClockWorkTracker {
  readonly runParked: <T>(wait: () => Promise<T>) => Promise<T>;

  readonly isSettled: () => boolean;
}

interface WorkContext {
  readonly waits: number;
}

type WorkEvent = { readonly type: 'park' } | { readonly type: 'unpark' };

const workMachine = setup({
  types: machineTypes<{ context: WorkContext; events: WorkEvent }>(),
  guards: { hasOtherWaits: (check) => check.context.waits > 1 },
}).createMachine({
  id: 'work',
  context: { waits: 0 },
  initial: 'running',
  states: {
    running: {
      on: { park: { target: 'parked', actions: assign({ waits: 1 }) } },
    },
    parked: {
      on: {
        park: { actions: assign({ waits: (parked) => parked.context.waits + 1 }) },
        unpark: [
          {
            guard: 'hasOtherWaits',
            actions: assign({ waits: (parked) => parked.context.waits - 1 }),
          },
          { target: 'running', actions: assign({ waits: 0 }) },
        ],
      },
    },
  },
});

type Work = ActorRefFrom<typeof workMachine>;

export function buildWorkTracker(): WorkTracker {
  const current = new AsyncLocalStorage<Work>();
  const running = new Set<Work>();

  return {
    runWork: async (work) => {
      const entry = createActor(workMachine).start();

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

      entry.send({ type: 'park' });

      try {
        return await wait();
      } finally {
        entry.send({ type: 'unpark' });
      }
    },
    isSettled: () => [...running].every((entry) => entry.getSnapshot().matches('parked')),
  };
}

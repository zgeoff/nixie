import type { WorkerRunsConfig } from '@heynixie/tasks';
import type { WorkerSlotGrant, WorkerSlots } from './types';

interface Waiter {
  readonly grant: PromiseWithResolvers<WorkerSlotGrant>;
  readonly remove: () => void;
}

// The cap counts the worker runs of this process, which is the one process that runs steps. With no
// cap every call gets a slot at once.
export function makeWorkerSlots(config: WorkerRunsConfig | undefined): WorkerSlots {
  const state = { active: 0 };
  const waiting: Waiter[] = [];

  const release = (): void => {
    state.active -= 1;

    const next = waiting.shift();

    if (next !== undefined) {
      state.active += 1;

      next.remove();
      next.grant.resolve({ kind: 'granted', release: makeRelease(release) });
    }
  };

  return {
    acquire: (signal) => {
      signal.throwIfAborted();

      if (config === undefined || state.active < config.max) {
        state.active += 1;

        return Promise.resolve({ kind: 'granted', release: makeRelease(release) });
      }

      if (config.whenFull === 'error') {
        return Promise.resolve({ kind: 'full', max: config.max });
      }

      return waitForSlot(waiting, signal);
    },
  };
}

// A slot frees once, though a block that frees it runs more than once.
function makeRelease(release: () => void): () => void {
  const state = { isReleased: false };

  return () => {
    if (!state.isReleased) {
      state.isReleased = true;

      release();
    }
  };
}

function waitForSlot(waiting: Waiter[], signal: AbortSignal): Promise<WorkerSlotGrant> {
  const grant = Promise.withResolvers<WorkerSlotGrant>();

  const onAbort = () => {
    const index = waiting.indexOf(waiter);

    if (index !== -1) {
      waiting.splice(index, 1);
      grant.reject(signal.reason);
    }
  };

  const waiter: Waiter = {
    grant,
    remove: () => {
      signal.removeEventListener('abort', onAbort);
    },
  };

  signal.addEventListener('abort', onAbort, { once: true });
  waiting.push(waiter);

  return grant.promise;
}

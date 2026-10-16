import type { SubscribeToChanges } from './types';

export interface RecordWakeOptions {
  readonly subscribeToChanges: SubscribeToChanges;
  readonly signal?: AbortSignal;
}

export interface RecordWake {
  // marks every earlier wake as seen, before a read
  readonly reset: () => void;

  // resolves at once when a wake arrived since the last reset, and otherwise at the next one
  readonly wait: () => Promise<void>;
  readonly stop: () => void;
}

// Starts the wakes that tell a reader new records may exist: each change its subscription reports,
// and the signal's abort. It starts pending, so the first wait never blocks a first read.
export function startRecordWake(options: RecordWakeOptions): RecordWake {
  const state: WakeState = { pending: true, stopped: false, waiter: null };

  const emitWake = (): void => {
    state.pending = true;
    state.waiter?.resolve();
    state.waiter = null;
  };

  const unsubscribe = options.subscribeToChanges(emitWake);

  const stop = (): void => {
    if (state.stopped) {
      return;
    }

    state.stopped = true;

    unsubscribe();
    options.signal?.removeEventListener('abort', stop);
    emitWake();
  };

  // an abort stops the subscription at once, even when no consumer pulls again
  options.signal?.addEventListener('abort', stop, { once: true });

  return {
    reset: () => {
      state.pending = false;
    },
    wait: () => {
      if (state.pending) {
        return Promise.resolve();
      }

      state.waiter ??= Promise.withResolvers<void>();

      return state.waiter.promise;
    },
    stop,
  };
}

interface WakeState {
  pending: boolean;
  stopped: boolean;
  waiter: PromiseWithResolvers<void> | null;
}

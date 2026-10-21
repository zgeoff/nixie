import type { SubscribeToChanges } from './types';

export interface RecordWakeOptions {
  readonly subscribeToChanges: SubscribeToChanges;
  readonly signal?: AbortSignal;
}

export interface RecordWake {
  readonly reset: () => void;

  readonly wait: () => Promise<void>;
  readonly stop: () => void;
}

interface WakeState {
  pending: boolean;
  stopped: boolean;
  waiter: PromiseWithResolvers<void> | null;
}

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

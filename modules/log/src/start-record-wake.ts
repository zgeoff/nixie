import { subscribeToWAL } from './subscribe-to-wal';

export interface RecordWakeOptions {
  readonly signal?: AbortSignal;
  readonly pollMs?: number;
  readonly subscribeToChanges?: (dataDir: string, onChange: () => void) => () => void;
}

export interface RecordWake {
  // marks every earlier wake as seen, before a read
  readonly reset: () => void;

  // resolves at once when a wake arrived since the last reset, and otherwise at the next one
  readonly wait: () => Promise<void>;
  readonly stop: () => void;
}

// Starts the wakes that tell a reader new records may exist: a change to nixie.db's WAL file, a
// poll every pollMs (1 s by default) for a change the watcher misses, and the signal's abort.
export function startRecordWake(dataDir: string, options: RecordWakeOptions): RecordWake {
  const state: WakeState = { pending: true, stopped: false, waiter: null };
  const emitWake = (): void => {
    state.pending = true;
    state.waiter?.resolve();
    state.waiter = null;
  };
  const unsubscribe = (options.subscribeToChanges ?? subscribeToWAL)(dataDir, emitWake);
  const poll = setInterval(emitWake, options.pollMs ?? DEFAULT_POLL_MS);

  const stop = (): void => {
    if (state.stopped) {
      return;
    }
    state.stopped = true;
    clearInterval(poll);
    unsubscribe();
    options.signal?.removeEventListener('abort', stop);
    emitWake();
  };

  // an abort stops the watcher and the poll at once, even when no consumer pulls again
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

const DEFAULT_POLL_MS = 1000;

import { systemClock } from '@heynixie/clock';
import { subscribeToWAL } from './subscribe-to-wal';
import type { Writer } from './types';

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
export function startRecordWake(
  writer: Pick<Writer, 'clock' | 'dataDir'>,
  options: RecordWakeOptions,
): RecordWake {
  const state: WakeState = { pending: true, stopped: false, waiter: null };

  const emitWake = (): void => {
    state.pending = true;
    state.waiter?.resolve();
    state.waiter = null;
  };

  // the settle delays wait for SQLite to publish a commit, which no test clock hurries, so they run
  // on the system clock; the poll runs on the writer's clock
  const subscribeToChanges =
    options.subscribeToChanges ??
    ((dataDir, onChange) => subscribeToWAL(dataDir, systemClock, onChange));

  const unsubscribe = subscribeToChanges(writer.dataDir, emitWake);

  const poll = new AbortController();

  startPoll(
    writer.clock,
    { pollMs: options.pollMs ?? DEFAULT_POLL_MS, signal: poll.signal },
    emitWake,
  );

  const stop = (): void => {
    if (state.stopped) {
      return;
    }

    state.stopped = true;

    poll.abort();

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

interface Poll {
  readonly pollMs: number;
  readonly signal: AbortSignal;
}

// wakes every pollMs on the clock until the signal aborts
function startPoll(clock: Writer['clock'], poll: Poll, onPoll: () => void): void {
  void (async () => {
    while (!poll.signal.aborted) {
      // oxlint-disable-next-line no-await-in-loop -- each poll waits out the last one's interval
      await clock.sleep(poll.pollMs, poll.signal);

      if (!poll.signal.aborted) {
        onPoll();
      }
    }
  })();
}

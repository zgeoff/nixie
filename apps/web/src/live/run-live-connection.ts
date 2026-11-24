import type { ContractClient, LiveTopic, LogRecord } from '@heynixie/contract';
import { isDefinedError } from '@orpc/client';
import { pickReconnectDelay } from '../conversation/pick-reconnect-delay';
import type { ReadonlyDeep } from '../types';
import type { StartTimer } from '../utils/start-platform-timer';

interface LiveOpening {
  // true on the connection's first open, and false on each reconnect
  readonly isFirst: boolean;
}

export interface LiveConnectionOptions {
  readonly client: ContractClient;

  // the thread whose records the stream carries; none opens a stream of topics only
  readonly thread: string | undefined;
  readonly afterSequence: number | undefined;

  readonly signal: AbortSignal;
  readonly startTimer: StartTimer;

  // runs on each `opened` event
  readonly onOpened: (opening: LiveOpening) => void;
  readonly onRecord: (record: ReadonlyDeep<LogRecord>) => void;
  readonly onChanged: (topics: readonly LiveTopic[]) => void;

  // runs after each attempt, with the failures in a row so far
  readonly onAttempt: (failures: number) => void;
}

// Follows the stream until the signal aborts, and opens it again after a break from the last
// record it delivered, so a reconnect misses no record and repeats none.
export async function runLiveConnection(options: LiveConnectionOptions): Promise<void> {
  const state = { after: options.afterSequence, failures: 0, opens: 0 };

  while (!options.signal.aborted) {
    const wake = startWakeWatch(options.signal);

    const connected = await readLiveStream(options, state, wake.signal);

    state.failures = connected ? 0 : state.failures + 1;

    options.onAttempt(state.failures);

    await waitForDelay(pickReconnectDelay(state.failures), options.startTimer, wake.signal);

    wake.stop();
  }
}

interface WakeWatch {
  readonly signal: AbortSignal;
  readonly stop: () => void;
}

// A phone that slept can hold a dead connection that no error reports, so a page that becomes
// visible again, or a browser that comes back online, follows again at once.
function startWakeWatch(outer: AbortSignal): WakeWatch {
  const controller = new AbortController();

  const stop = (): void => {
    outer.removeEventListener('abort', stopOnAbort);
    globalThis.removeEventListener('online', stopOnWake);
    globalThis.document.removeEventListener('visibilitychange', stopOnWake);
  };

  const stopOnAbort = (): void => {
    controller.abort();
  };

  const stopOnWake = (): void => {
    if (globalThis.document.visibilityState === 'visible') {
      controller.abort();
    }
  };

  outer.addEventListener('abort', stopOnAbort, { once: true });
  globalThis.addEventListener('online', stopOnWake);
  globalThis.document.addEventListener('visibilitychange', stopOnWake);

  return { signal: controller.signal, stop };
}

interface StreamState {
  after: number | undefined;
  opens: number;
}

async function readLiveStream(
  options: LiveConnectionOptions,
  state: StreamState,
  signal: AbortSignal,
): Promise<boolean> {
  const events = await tryStartLiveStream(options, state.after, signal);

  if (events === undefined) {
    return false;
  }

  // The iterator stops a read in flight when it returns, even where an abort does not reach the
  // response body.
  signal.addEventListener('abort', () => void events.return(undefined), { once: true });

  const reading = { isConnected: false };

  try {
    for await (const event of events) {
      if (event.kind === 'opened') {
        reading.isConnected = true;
        state.opens += 1;

        options.onOpened({ isFirst: state.opens === 1 });
      }

      if (event.kind === 'record') {
        state.after = event.record.sequence;

        options.onRecord(event.record);
      }

      if (event.kind === 'changed') {
        options.onChanged(event.topics);
      }
    }
  } catch (error) {
    return reading.isConnected && !isDefinedError(error);
  }

  return reading.isConnected;
}

type LiveEvents = Awaited<ReturnType<ContractClient['live']['follow']>>;

async function tryStartLiveStream(
  options: LiveConnectionOptions,
  afterSequence: number | undefined,
  signal: AbortSignal,
): Promise<LiveEvents | undefined> {
  const input =
    options.thread === undefined || afterSequence === undefined
      ? {}
      : { afterSequence, clipPayloads: true, thread: options.thread };

  try {
    return await options.client.live.follow(input, { signal });
  } catch {
    return undefined;
  }
}

async function waitForDelay(
  milliseconds: number,
  startTimer: StartTimer,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = startTimer(resolve, milliseconds);

    signal.addEventListener(
      'abort',
      () => {
        stop();
        resolve();
      },
      { once: true },
    );
  });
}

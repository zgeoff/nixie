import type { ContractClient, LogRecord } from '@heynixie/contract';
import { isDefinedError } from '@orpc/client';
import { pickReconnectDelay } from './pick-reconnect-delay';
import type { StartTimer } from './start-platform-timer';
import type { ReadonlyDeep } from './types';

export interface SubscribeOptions {
  readonly afterSequence: number;
  readonly client: ContractClient;

  // false after several failed attempts in a row, and true once the API accepts a stream again
  readonly onAvailability: (isAvailable: boolean) => void;
  readonly onRecord: (record: ReadonlyDeep<LogRecord>) => void;

  // stops following the log, which ends the open connection or the pause
  readonly signal: AbortSignal;

  // times the pause before each reconnect
  readonly startTimer: StartTimer;
  readonly thread: string;
}

// After this many failed attempts in a row the page says live updates are unavailable. A blocker
// or a server that is down fails every attempt, while one dropped connection fails only one.
const unavailableAfterFailures = 3;

// Follows the log of a thread from a sequence until the signal aborts. A dropped stream follows
// again from the last record it delivered, and a stream that keeps failing backs off.
export async function subscribeToLiveRecords(options: SubscribeOptions): Promise<void> {
  const state = { after: options.afterSequence, failures: 0 };

  while (!options.signal.aborted) {
    const wake = startWakeWatch(options.signal);

    const attempt = await readRecordStream(options, state.after, wake.signal);

    state.after = attempt.after;
    state.failures = attempt.connected ? 0 : state.failures + 1;

    if (state.failures >= unavailableAfterFailures) {
      options.onAvailability(false);
    }

    // A page that wakes during the pause ends it, so the client follows again at once.
    await waitForDelay(pickReconnectDelay(state.failures), options.startTimer, wake.signal);

    wake.stop();
  }
}

interface WakeWatch {
  // aborts when the caller aborts or the page wakes, which ends the connection or the pause
  readonly signal: AbortSignal;
  readonly stop: () => void;
}

// Watches one attempt: its connection and the pause after it. A page that becomes visible again,
// or a browser that comes back online, follows again at once: a phone that slept can hold a dead
// connection that no error reports, and a network that came back skips the rest of the backoff.
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

interface Attempt {
  // the sequence of the last record the stream delivered
  readonly after: number;

  // whether the API accepted the stream and opened it, which resets the backoff
  readonly connected: boolean;
}

type RecordEvents = Awaited<ReturnType<ContractClient['records']['follow']>>;

// Reads one connection of the stream until it ends, drops or the caller aborts. The API checks the
// session before it opens the stream, so a stream that opens is one the API accepted: only that
// clears the unavailable notice, and it resets the backoff unless the API then ends it.
async function readRecordStream(
  options: SubscribeOptions,
  afterSequence: number,
  signal: AbortSignal,
): Promise<Attempt> {
  const events = await tryStartRecordStream(options, afterSequence, signal);

  if (events === undefined) {
    return { after: afterSequence, connected: false };
  }

  options.onAvailability(true);

  // The iterator stops a read in flight when it returns, even where an abort does not reach the
  // response body.
  signal.addEventListener('abort', () => void events.return(undefined), { once: true });

  return drainRecordStream(options, events, afterSequence);
}

// Opens the stream, or resolves with nothing when the request fails or the API refuses it.
async function tryStartRecordStream(
  options: SubscribeOptions,
  afterSequence: number,
  signal: AbortSignal,
): Promise<RecordEvents | undefined> {
  try {
    return await options.client.records.follow(
      { afterSequence, thread: options.thread },
      { signal },
    );
  } catch {
    return undefined;
  }
}

// Delivers each record of an open stream until it ends. A stream that the API ends with one of its
// errors, such as a refusal from a server that checks the session after it opens the stream,
// counts as a failure.
async function drainRecordStream(
  options: SubscribeOptions,

  events: RecordEvents,
  afterSequence: number,
): Promise<Attempt> {
  const state = { after: afterSequence };

  try {
    for await (const event of events) {
      state.after = event.record.sequence;

      options.onRecord(event.record);
    }
  } catch (error) {
    // The stream dropped, went quiet or the API ended it; the caller follows again.
    return { after: state.after, connected: !isDefinedError(error) };
  }

  return { after: state.after, connected: true };
}

// Waits the delay, or ends at once when the signal aborts, as a wake during the connection does.
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

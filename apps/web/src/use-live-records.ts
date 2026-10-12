import type { ContractClient, LogRecord } from '@heynixie/contract';
import { isDefinedError } from '@orpc/client';
import { useEffect, useState } from 'react';
import { pickReconnectDelay } from './pick-reconnect-delay';
import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';
import type { ReadonlyDeep } from './types';
import { useNixieClient } from './use-nixie-client';

export type LiveRecord = ReadonlyDeep<LogRecord>;

export interface LiveRecords {
  readonly records: readonly LiveRecord[];

  // whether the stream failed several attempts in a row, until it connects again
  readonly unavailable: boolean;
}

export interface LiveRecordsOptions {
  // Times the pause before each reconnect. The platform timer by default.
  readonly startTimer?: StartTimer;
}

// Follows the log from the sequence a page was read at, so the conversation misses no record and
// repeats none. A dropped stream follows again from the last record it delivered, and a stream
// that keeps failing backs off and reports itself unavailable.
export function useLiveRecords(
  thread: string,
  afterSequence: number | undefined,
  options: LiveRecordsOptions = {},
): LiveRecords {
  const client = useNixieClient().client;
  const startTimer = options.startTimer ?? startPlatformTimer;
  const [records, setRecords] = useState<readonly LiveRecord[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const following = new AbortController();

    if (afterSequence !== undefined) {
      void subscribeToRecords({
        afterSequence,
        client,
        onAvailability: (isAvailable) => {
          setUnavailable(!isAvailable);
        },
        onRecord: (record) => {
          setRecords((current) => [...current, record]);
        },
        signal: following.signal,
        startTimer,
        thread,
      });
    }

    return () => {
      following.abort();
    };
  }, [afterSequence, client, startTimer, thread]);

  return { records, unavailable };
}

interface SubscribeOptions {
  readonly afterSequence: number;
  readonly client: ContractClient;
  readonly onAvailability: (isAvailable: boolean) => void;
  readonly onRecord: (record: LiveRecord) => void;
  readonly signal: AbortSignal;
  readonly startTimer: StartTimer;
  readonly thread: string;
}

// After this many failed attempts in a row the page says live updates are unavailable. A blocker
// or a server that is down fails every attempt, while one dropped connection fails only one.
const unavailableAfterFailures = 3;

async function subscribeToRecords(options: SubscribeOptions): Promise<void> {
  const state = { after: options.afterSequence, failures: 0 };

  while (!options.signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- each connection starts after the last record
    const attempt = await readConnection(options, state.after);

    state.after = attempt.after;
    state.failures = attempt.connected ? 0 : state.failures + 1;

    if (state.failures >= unavailableAfterFailures) {
      options.onAvailability(false);
    }
    if (!attempt.woken) {
      // oxlint-disable-next-line no-await-in-loop -- the client pauses before it reconnects
      await waitForDelay(pickReconnectDelay(state.failures), options);
    }
  }
}

interface Attempt {
  // the sequence of the last record the stream delivered
  readonly after: number;

  // whether the API accepted the stream and opened it, which resets the backoff
  readonly connected: boolean;
}

// Reads one connection of the stream, and reports whether the page woke during it.
async function readConnection(
  options: SubscribeOptions,
  afterSequence: number,
): Promise<Attempt & { readonly woken: boolean }> {
  const connection = startConnection(options.signal);
  const attempt = await readRecordStream(options, afterSequence, connection.signal);

  connection.stop();

  return { ...attempt, woken: connection.woken };
}

interface Connection {
  readonly signal: AbortSignal;
  readonly stop: () => void;

  // whether the page woke while the connection was open, which ends it for an immediate reconnect
  readonly woken: boolean;
}

// One connection of the stream. A page that becomes visible again, or a browser that comes back
// online, ends the connection and follows again at once: a phone that slept can hold a dead
// connection that no error reports.
function startConnection(outer: AbortSignal): Connection {
  const controller = new AbortController();
  const state = { woken: false };
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
      state.woken = true;
      controller.abort();
    }
  };

  outer.addEventListener('abort', stopOnAbort, { once: true });
  globalThis.addEventListener('online', stopOnWake);
  globalThis.document.addEventListener('visibilitychange', stopOnWake);

  return {
    signal: controller.signal,
    stop,
    get woken() {
      return state.woken;
    },
  };
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

  // oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- an async iterator has no readonly form
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

async function waitForDelay(milliseconds: number, options: SubscribeOptions): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- the timer calls back and has no promise form
  await new Promise<void>((resolve) => {
    const stop = options.startTimer(resolve, milliseconds);

    options.signal.addEventListener(
      'abort',
      () => {
        stop();
        resolve();
      },
      { once: true },
    );
  });
}

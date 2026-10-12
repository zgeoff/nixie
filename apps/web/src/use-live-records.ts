import type { ContractClient, LogRecord } from '@heynixie/contract';
import { useEffect, useState } from 'react';
import type { ReadonlyDeep } from './types';
import { useNixieClient } from './use-nixie-client';

export type LiveRecord = ReadonlyDeep<LogRecord>;

// Follows the log from the sequence a page was read at, so the conversation misses no record and
// repeats none. A dropped stream follows again from the last record it delivered.
export function useLiveRecords(
  thread: string,
  afterSequence: number | undefined,
): readonly LiveRecord[] {
  const client = useNixieClient().client;
  const [records, setRecords] = useState<readonly LiveRecord[]>([]);

  useEffect(() => {
    const following = new AbortController();

    if (afterSequence !== undefined) {
      void subscribeToRecords({
        afterSequence,
        client,
        onRecord: (record) => {
          setRecords((current) => [...current, record]);
        },
        signal: following.signal,
        thread,
      });
    }

    return () => {
      following.abort();
    };
  }, [afterSequence, client, thread]);

  return records;
}

interface SubscribeOptions {
  readonly afterSequence: number;
  readonly client: ContractClient;
  readonly onRecord: (record: LiveRecord) => void;
  readonly signal: AbortSignal;
  readonly thread: string;
}

// How long the client waits before it follows the log again after the stream drops.
const reconnectDelay = 1000;

async function subscribeToRecords(options: SubscribeOptions): Promise<void> {
  let after = options.afterSequence;

  while (!options.signal.aborted) {
    const connection = startConnection(options.signal);

    // oxlint-disable-next-line no-await-in-loop -- each connection starts after the last record
    after = await readRecordStream(options, after, connection.signal);
    connection.stop();

    if (!connection.woken) {
      // oxlint-disable-next-line no-await-in-loop -- the client pauses before it reconnects
      await waitForDelay(reconnectDelay, options.signal);
    }
  }
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

// Reads one connection of the stream until it ends, drops or the caller aborts, and resolves with
// the sequence of the last record it delivered.
async function readRecordStream(
  options: SubscribeOptions,
  afterSequence: number,
  signal: AbortSignal,
): Promise<number> {
  let after = afterSequence;

  try {
    const events = await options.client.log.follow(
      { afterSequence, thread: options.thread },
      { signal },
    );

    // The iterator stops a read in flight when it returns, even where an abort does not reach the
    // response body.
    signal.addEventListener('abort', () => void events.return(undefined), { once: true });

    for await (const event of events) {
      after = event.record.sequence;
      options.onRecord(event.record);
    }
  } catch {
    // The stream dropped, went quiet or the API refused it; the caller follows again.
  }

  return after;
}

async function waitForDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
  // oxlint-disable-next-line promise/avoid-new -- a browser timer has no promise form
  await new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, milliseconds);

    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

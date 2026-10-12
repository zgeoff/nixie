import type { LogRecord } from '@heynixie/contract';
import { useEffect, useState } from 'react';
import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';
import { subscribeToLiveRecords } from './subscribe-to-live-records';
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
      void subscribeToLiveRecords({
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

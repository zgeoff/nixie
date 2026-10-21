import type { LogRecord } from '@heynixie/contract';
import { useQueryClient } from '@tanstack/react-query';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useState } from 'react';
import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';
import type { SubscribeOptions } from './subscribe-to-live-records';
import { subscribeToLiveRecords } from './subscribe-to-live-records';
import type { ReadonlyDeep } from './types';
import { useNixieClient } from './use-nixie-client';

export type LiveRecord = ReadonlyDeep<LogRecord>;

export interface LiveRecords {
  readonly records: readonly LiveRecord[];

  readonly unavailable: boolean;
}

export interface LiveRecordsOptions {
  readonly startTimer?: StartTimer;
}

export function useLiveRecords(
  thread: string,
  afterSequence: number | undefined,
  options: LiveRecordsOptions = {},
): LiveRecords {
  const client = useNixieClient().client;
  const queryClient = useQueryClient();
  const startTimer = options.startTimer ?? startPlatformTimer;
  const [records, setRecords] = useState<readonly LiveRecord[]>([]);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const following = new AbortController();

    if (afterSequence !== undefined) {
      void subscribeToLiveRecords({
        afterSequence,
        client,
        ...buildStreamCallbacks({
          invalidateQueries: () => queryClient.invalidateQueries(),
          setRecords,
          setUnavailable,
        }),
        signal: following.signal,
        startTimer,
        thread,
      });
    }

    return () => {
      following.abort();
    };
  }, [afterSequence, client, queryClient, startTimer, thread]);

  return { records, unavailable };
}

interface StreamState {
  readonly invalidateQueries: () => Promise<void>;
  readonly setRecords: Dispatch<SetStateAction<readonly LiveRecord[]>>;
  readonly setUnavailable: (unavailable: boolean) => void;
}

type StreamCallbacks = Pick<SubscribeOptions, 'onAvailability' | 'onRecord'>;

function buildStreamCallbacks(state: StreamState): StreamCallbacks {
  const reset = { isPending: false };

  return {
    onAvailability: (isAvailable) => {
      state.setUnavailable(!isAvailable);

      if (isAvailable && reset.isPending) {
        reset.isPending = false;
        void state.invalidateQueries();
      }
    },
    onRecord: (record) => {
      if (record.kind === 'log_reset') {
        reset.isPending = true;

        state.setRecords([record]);
        void state.invalidateQueries();

        return;
      }

      state.setRecords((current) => [...current, record]);
    },
  };
}

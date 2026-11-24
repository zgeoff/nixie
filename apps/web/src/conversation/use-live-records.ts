import type { LogRecord } from '@heynixie/contract';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useLiveFeed } from '../live/use-live-feed';
import { useLiveUnavailable } from '../live/use-live-unavailable';
import type { ReadonlyDeep } from '../types';

export type LiveRecord = ReadonlyDeep<LogRecord>;

export interface LiveRecords {
  readonly records: readonly LiveRecord[];

  readonly unavailable: boolean;
}

// The records of the thread on screen, from the sequence its page read at. A later read of the page
// keeps the stream, which already holds everything after the first read.
export function useLiveRecords(thread: string, afterSequence: number | undefined): LiveRecords {
  const feed = useLiveFeed();
  const queryClient = useQueryClient();
  const unavailable = useLiveUnavailable();
  const [records, setRecords] = useState<readonly LiveRecord[]>([]);
  const start = useRef({ thread, after: afterSequence });
  const isRead = afterSequence !== undefined;
  const reset = useRef({ isPending: false });

  useEffect(() => {
    if (start.current.thread !== thread) {
      start.current = { thread, after: afterSequence };
    }

    start.current.after ??= afterSequence;
  }, [afterSequence, thread]);

  useEffect(() => {
    const first = start.current.after;

    if (!isRead || first === undefined) {
      return () => {};
    }

    setRecords([]);

    return feed.follow({
      thread,
      afterSequence: first,
      onOpened: () => {
        // a read after a reset can fail, so the stream's next open reads again
        if (reset.current.isPending) {
          reset.current.isPending = false;
          void queryClient.invalidateQueries();
        }
      },
      onRecord: (record) => {
        if (record.kind === 'log_reset') {
          reset.current.isPending = true;

          setRecords([record]);
          void queryClient.invalidateQueries();

          return;
        }

        setRecords((current) => [...current, record]);
      },
    });
  }, [feed, isRead, queryClient, thread]);

  return { records, unavailable };
}

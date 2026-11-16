import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { subscribeToLiveRecords } from '../conversation/subscribe-to-live-records';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';

export interface FollowViewRecordsOptions {
  // the record kinds that change the view
  readonly kinds: ReadonlySet<string>;

  // runs on each record of those kinds, to read the view again
  readonly onChange: () => void;

  readonly startTimer?: StartTimer;
}

// Follows the log from the head that the task list saw, so a change between a view's read and the
// start of the stream reaches the view once. The views have no poll.
export function useFollowViewRecords(options: FollowViewRecordsOptions): {
  readonly unavailable: boolean;
} {
  const nixie = useNixieClient();

  const listed = useQuery({
    ...nixie.queryUtils.tasks.list.queryOptions(),
    staleTime: routeDataStaleTimeMs,
  });

  const [unavailable, setUnavailable] = useState(false);
  const afterSequence = listed.data?.readAtSequence;
  const client = nixie.client;
  const kinds = options.kinds;
  const onChange = useRef(options.onChange);
  const startTimer = options.startTimer ?? startPlatformTimer;

  useEffect(() => {
    onChange.current = options.onChange;
  }, [options.onChange]);

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
          if (kinds.has(record.kind)) {
            onChange.current();
          }
        },
        signal: following.signal,
        startTimer,
      });
    }

    return () => {
      following.abort();
    };
  }, [afterSequence, client, kinds, startTimer]);

  return { unavailable };
}

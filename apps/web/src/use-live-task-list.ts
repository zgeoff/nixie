import type { ContractOutputs } from '@heynixie/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { isTaskListRecord } from './is-task-list-record';
import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';
import { subscribeToLiveRecords } from './subscribe-to-live-records';
import { useNixieClient } from './use-nixie-client';

export type ListedTask = ContractOutputs['tasks']['list']['tasks'][number];

export interface LiveTaskList {
  readonly status: 'pending' | 'failed' | 'loaded';
  readonly tasks: readonly ListedTask[];
  readonly unavailable: boolean;

  readonly onRetry: () => void;
}

export interface LiveTaskListOptions {
  readonly startTimer?: StartTimer;
}

export function useLiveTaskList(options: LiveTaskListOptions = {}): LiveTaskList {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.tasks.list.queryOptions());
  const [unavailable, setUnavailable] = useState(false);
  const startTimer = options.startTimer ?? startPlatformTimer;
  const afterSequence = listed.data?.readAtSequence;
  const refetch = listed.refetch;
  const client = nixie.client;
  const queryClient = useQueryClient();
  const queryUtils = nixie.queryUtils;

  // Each read of the list restarts the stream at the sequence that read saw, so a change between
  // two reads reaches the list once.
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
          if (isTaskListRecord(record.kind)) {
            void queryClient.invalidateQueries(
              { queryKey: queryUtils.tasks.key() },
              { cancelRefetch: false },
            );
          }
        },
        signal: following.signal,
        startTimer,
      });
    }

    return () => {
      following.abort();
    };
  }, [afterSequence, client, queryClient, queryUtils, startTimer]);

  return {
    status: pickListStatus(listed.isSuccess, listed.isError),
    tasks: listed.data?.tasks ?? [],
    unavailable,
    onRetry: () => {
      void refetch();
    },
  };
}

function pickListStatus(isSuccess: boolean, isError: boolean): LiveTaskList['status'] {
  if (isSuccess) {
    return 'loaded';
  }

  return isError ? 'failed' : 'pending';
}

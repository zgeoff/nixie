import type { ContractOutputs } from '@heynixie/contract';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { subscribeToLiveRecords } from '../conversation/subscribe-to-live-records';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { isTaskListRecord } from './is-task-list-record';
import type { ListedState } from './listed-state';

export type ListedTask = ContractOutputs['tasks']['list']['tasks'][number];

export interface LiveTaskList {
  readonly status: 'pending' | 'failed' | 'loaded';
  readonly tasks: readonly ListedTask[];
  readonly unavailable: boolean;

  readonly onRetry: () => void;
}

export interface LiveTaskListOptions {
  readonly startTimer?: StartTimer;

  // lists only the tasks of this definition
  readonly definitionID?: string;

  // lists only the tasks in this listed state
  readonly state?: ListedState;
}

// The dashboard reads the list again on this period while the page is visible, because a task
// that wakes on a schedule changes with no record of its own.
export const taskListRefetchMs = 60_000;

export function useLiveTaskList(options: LiveTaskListOptions = {}): LiveTaskList {
  const nixie = useNixieClient();

  const listed = useQuery({
    ...nixie.queryUtils.tasks.list.queryOptions({
      input: {
        ...(options.definitionID === undefined ? {} : { definitionID: options.definitionID }),
        ...(options.state === undefined ? {} : { states: [options.state] }),
      },
    }),
    refetchInterval: taskListRefetchMs,
    refetchOnWindowFocus: 'always',
    staleTime: routeDataStaleTimeMs,
  });

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

          // A new task can be a definition's task, which the definition filter then offers.
          if (record.kind === 'task.created') {
            void queryClient.invalidateQueries(
              { queryKey: queryUtils.definitions.listTasks.key() },
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

import type { ContractOutputs } from '@heynixie/contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { useLiveUnavailable } from '../live/use-live-unavailable';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import type { ListedState } from './listed-state';

export type ListedTask = ContractOutputs['tasks']['list']['tasks'][number];

export interface LiveTaskList {
  readonly status: 'pending' | 'failed' | 'loaded';
  readonly tasks: readonly ListedTask[];
  readonly unavailable: boolean;

  readonly onRetry: () => void;
}

export interface LiveTaskListOptions {
  // starts the timer for the read at the list's `changesAt`
  readonly startTimer?: StartTimer;

  // lists only the tasks of this definition
  readonly definitionID?: string;

  // lists only the tasks in this listed state
  readonly state?: ListedState;
}

// A timer holds a delay of 2^31 ms at most, and the read at a later time starts a new timer.
const longestDelayMs = 2_147_483_647;

// The list follows the live stream's `tasks` topic, and reads again at the time its own answer
// names, because a task that wakes on a schedule changes with no write.
export function useLiveTaskList(options: LiveTaskListOptions = {}): LiveTaskList {
  const nixie = useNixieClient();
  const unavailable = useLiveUnavailable();
  const startTimer = options.startTimer ?? startPlatformTimer;

  const listed = useQuery({
    ...nixie.queryUtils.tasks.list.queryOptions({
      input: {
        ...(options.definitionID === undefined ? {} : { definitionID: options.definitionID }),
        ...(options.state === undefined ? {} : { states: [options.state] }),
      },
    }),
    refetchOnWindowFocus: 'always',
    staleTime: routeDataStaleTimeMs,
  });

  const refetch = listed.refetch;
  const changesAtMs = listed.data?.changesAt?.getTime();

  useEffect(() => {
    if (changesAtMs === undefined) {
      return () => {};
    }

    const delayMs = Math.min(Math.max(changesAtMs - Date.now(), 0), longestDelayMs);

    return startTimer(() => {
      void refetch();
    }, delayMs);
  }, [changesAtMs, refetch, startTimer]);

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

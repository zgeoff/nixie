import type { ContractOutputs } from '@heynixie/contract';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import type { MessageRoute } from './collect-message-routes';
import { useNixieClient } from './use-nixie-client';

type ListedTask = ContractOutputs['tasks']['list']['tasks'][number];

export function useRoutedTasks(routes: ReadonlyMap<number, MessageRoute>): readonly ListedTask[] {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.tasks.list.queryOptions());
  const asked = useRef(new Set<string>());
  const tasks = listed.data?.tasks ?? [];

  const known = new Set(tasks.map((task) => task.taskID));

  const unknown = [...routes.values()].find(
    (route) => !known.has(route.taskID) && !asked.current.has(route.taskID),
  )?.taskID;

  const isSettled = listed.isSuccess && !listed.isFetching;
  const refetch = listed.refetch;

  // A route can name a task that started after the list loaded. One more read per such task
  // stops a task the list never holds from reading the list forever.
  useEffect(() => {
    if (unknown !== undefined && isSettled) {
      asked.current.add(unknown);
      void refetch();
    }
  }, [unknown, isSettled, refetch]);

  return tasks;
}

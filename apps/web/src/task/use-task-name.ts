import { useQuery } from '@tanstack/react-query';
import { routeDataStaleTimeMs } from '../conversation/read-route-session';
import { useNixieClient } from '../utils/use-nixie-client';

export function useTaskName(taskID: string, knownName: string | undefined): string {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.tasks.read.queryOptions({ input: { taskID } }),
    staleTime: routeDataStaleTimeMs,
    enabled: knownName === undefined,
  });

  return knownName ?? read.data?.name ?? `task ${taskID}`;
}

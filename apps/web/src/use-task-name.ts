import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from './use-nixie-client';

export function useTaskName(taskID: string, knownName: string | undefined): string {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.tasks.read.queryOptions({ input: { taskID } }),
    enabled: knownName === undefined,
  });

  return knownName ?? read.data?.name ?? `task ${taskID}`;
}

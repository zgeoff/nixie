import { useQuery } from '@tanstack/react-query';
import { useNixieClient } from '../utils/use-nixie-client';

export interface TaskDefinition {
  readonly definitionID: string;
  readonly name: string;
}

// The definitions that own a task, which the dashboard's definition filter offers by name.
export function useTaskDefinitions(): readonly TaskDefinition[] {
  const nixie = useNixieClient();
  const listed = useQuery(nixie.queryUtils.definitions.listTasks.queryOptions());

  return (listed.data?.definitions ?? [])
    .filter((definition) => definition.taskID !== null)
    .map((definition) => ({ definitionID: definition.definitionID, name: definition.name }));
}

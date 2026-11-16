import { mockViewStore } from './mock-view-store';
import { store } from './store';

// The definitions of the tasks that name one, then each definition a test puts in the view store
export function readMockDefinitions() {
  const owners = store.tasks.all().filter((task) => task.definitionID !== undefined);

  const owned = owners.map((task) => ({
    definitionID: task.definitionID ?? '',
    name: task.name,
    enabled: true,
    target: 'task' as const,
    trigger: null,
    rendered: null,
    next: null,
    tools: [],
    origin: 'definitions' as const,
    createdBy: { sequence: 1, kind: 'definitions_seeded' as const },
    taskID: task.taskID,
    isUnreadable: false,
  }));

  return { definitions: [...owned, ...structuredClone(mockViewStore.definitions.all())] };
}

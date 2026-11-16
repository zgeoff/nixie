import type { TasksContext } from '../types';
import type { ListedTaskState } from './pick-listed-task-state';
import type { ListedTask } from './read-task-list';

// Only an asleep task of a definition has a next run to show.
export function readListedNextRun(
  context: Pick<TasksContext, 'log' | 'readDefinitionNextFire'>,
  task: Pick<ListedTask, 'definitionID'>,
  state: ListedTaskState,
): Promise<string | null> {
  if (state !== 'asleep' || task.definitionID === null) {
    return Promise.resolve(null);
  }

  return context.readDefinitionNextFire(context.log.writer.db, task.definitionID);
}

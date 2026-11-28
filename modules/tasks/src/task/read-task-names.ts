import type { TasksContext } from '../types';
import type { TaskDirectoryQuery } from './read-task-directory';
import { readTaskDirectory } from './read-task-directory';
import { readUnlistedProfiles } from './read-unlisted-profiles';

// The name of each task that has one, by task ID: started tasks, definition tasks in force and
// definition tasks out of force. A task named by its own ID has no name here. Given task IDs, it
// reads only those tasks.
export async function readTaskNames(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  query: TaskDirectoryQuery = {},
): Promise<ReadonlyMap<string, string>> {
  const listed = await readTaskDirectory(context, { directory: [] }, query);
  const unlisted = await readUnlistedProfiles(context, listed.directory, query);

  return new Map(
    [...listed.directory, ...unlisted]
      .filter((profile) => profile.speaker !== 'conversation' && profile.name !== profile.taskID)
      .map((profile) => [profile.taskID, profile.name]),
  );
}

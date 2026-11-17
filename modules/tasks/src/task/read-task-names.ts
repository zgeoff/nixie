import type { TasksContext } from '../types';
import { readTaskDirectory } from './read-task-directory';
import { readUnlistedProfiles } from './read-unlisted-profiles';

// The name of each task that has one, by task ID: started tasks, definition tasks in force and
// definition tasks out of force. A task named by its own ID has no name here.
export async function readTaskNames(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
): Promise<ReadonlyMap<string, string>> {
  const listed = await readTaskDirectory(context, { directory: [] });
  const unlisted = await readUnlistedProfiles(context, listed.directory);

  return new Map(
    [...listed.directory, ...unlisted]
      .filter((profile) => profile.speaker !== 'conversation' && profile.name !== profile.taskID)
      .map((profile) => [profile.taskID, profile.name]),
  );
}

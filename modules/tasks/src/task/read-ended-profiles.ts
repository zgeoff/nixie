import { readEndedRuns } from '../run/read-ended-runs';
import type { TaskProfile, TasksContext } from '../types';
import { readPinnedProfiles } from './read-pinned-profiles';

// The profile of each definition task from the version that its newest ended task run pins. A task
// with no such version has no profile in the result.
export async function readEndedProfiles(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  taskIDs: readonly string[],
): Promise<TaskProfile[]> {
  const newest = await Promise.all(
    taskIDs.map((taskID) => readEndedRuns(context, { taskID, limit: 1 })),
  );

  return readPinnedProfiles(context, newest.flat(), taskIDs);
}

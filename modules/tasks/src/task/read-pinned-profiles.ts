import type { TaskRun } from '../run/types';
import type { TaskProfile, TasksContext } from '../types';

// A task of a definition that left force, with no open task run, is in no directory. Its profile
// comes from the version that its newest ended task run pins, so the runs go newest first.
export async function readPinnedProfiles(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  runs: readonly TaskRun[],
  taskIDs: readonly string[],
): Promise<TaskProfile[]> {
  const profiles: TaskProfile[] = [];

  for (const taskID of taskIDs) {
    const hash = runs.find((run) => run.taskID === taskID && run.opened.definitionHash !== null)
      ?.opened.definitionHash;

    const version =
      hash === undefined || hash === null
        ? null
        : await context.readDefinitionVersion(context.log.writer.db, hash);

    if (version !== null) {
      profiles.push({
        taskID,
        name: version.name,
        brief: version.brief,
        wakeable: false,
        speaker: version.persona === 'default' ? 'persona_task' : 'plain_task',
      });
    }
  }

  return profiles;
}

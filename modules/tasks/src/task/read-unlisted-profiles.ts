import type { TaskProfile, TasksContext, TasksTables } from '../types';
import { readDefinitionTaskVersions } from './read-definition-task-versions';
import { readEndedProfiles } from './read-ended-profiles';

// The profiles of the definition tasks that the directory leaves out: a task whose shown version
// is not in force, and a task with no open task run, whose profile comes from its newest ended
// task run. It reads no ended task run when the directory holds every definition task.
export async function readUnlistedProfiles(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  directory: readonly TaskProfile[],
): Promise<TaskProfile[]> {
  const versions = await readDefinitionTaskVersions(context);

  const outOfForce = versions
    .filter((entry) => !entry.isInForce)
    .map((entry): TaskProfile => ({
      taskID: entry.taskID,
      name: entry.version.name,
      brief: entry.version.brief,
      wakeable: false,
      speaker: entry.version.persona === 'default' ? 'persona_task' : 'plain_task',
    }));

  const rows = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('task_id')
    .where('definition_id', 'is not', null)
    .execute();

  const known = new Set([
    ...directory.map((profile) => profile.taskID),
    ...versions.map((entry) => entry.taskID),
  ]);

  const ended = await readEndedProfiles(
    context,
    rows.map((row) => row.task_id).filter((taskID) => !known.has(taskID)),
  );

  return [...outOfForce, ...ended];
}

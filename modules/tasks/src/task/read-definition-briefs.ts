import { buildDefinitionBrief } from '../brief/build-definition-brief';
import type { TaskBrief } from '../brief/task-brief';
import { readRunRows } from '../run/read-run-rows';
import type { TasksContext } from '../types';
import { readDefinitionTaskVersions } from './read-definition-task-versions';

// The brief that each definition's task among the given IDs shows: the version in force, or for a
// task out of force the version that its open task run pins. A task with no open task run to give
// the brief its ID is left out.
export async function readDefinitionBriefs(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  taskIDs: readonly string[],
): Promise<ReadonlyMap<string, TaskBrief>> {
  const briefs = new Map<string, TaskBrief>();

  if (taskIDs.length === 0) {
    return briefs;
  }

  const versions = await readDefinitionTaskVersions(context);

  for (const entry of versions.filter((version) => taskIDs.includes(version.taskID))) {
    const runs = await readRunRows(context.log.writer.db, entry.taskID);

    const open = runs.find((run) => run.ended === null);
    const brief = open === undefined ? null : buildDefinitionBrief(open, entry.version.brief);

    if (brief !== null) {
      briefs.set(entry.taskID, brief);
    }
  }

  return briefs;
}

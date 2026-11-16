import { buildDefinitionBrief } from '../brief/build-definition-brief';
import type { TaskBrief } from '../brief/task-brief';
import { readRunRows } from '../run/read-run-rows';
import type { TasksContext } from '../types';

// The brief of a definition's task, from its open task run and the version that run pins. Null when
// the task has no open task run, since nixie shows no brief of an ended one, or when the version is
// not stored.
export async function readOpenRunBrief(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  taskID: string,
): Promise<TaskBrief | null> {
  const db = context.log.writer.db;

  const runs = await readRunRows(db, taskID);

  const open = runs.find((run) => run.ended === null);
  const hash = open?.opened.definitionHash ?? null;

  if (open === undefined || hash === null) {
    return null;
  }

  const version = await context.readDefinitionVersion(db, hash);

  return version === null ? null : buildDefinitionBrief(open, version.brief);
}

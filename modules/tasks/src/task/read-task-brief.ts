import type { TaskBrief } from '../brief/task-brief';
import type { TasksContext, TasksTables } from '../types';
import { readOpenRunBrief } from './read-open-run-brief';
import { readTaskBriefs } from './read-task-briefs';

// The brief current at `before`, or now. Null for a task with no brief of its own, such as the
// conversation, for a definition's task with no open task run, and for a brief that a later
// sequence wrote.
export async function readTaskBrief(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion'>,
  taskID: string,
  before?: number,
): Promise<TaskBrief | null> {
  const row = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .select('definition_id')
    .where('task_id', '=', taskID)
    .executeTakeFirst();

  const isDefinitionTask = row?.definition_id !== null && row?.definition_id !== undefined;
  const started = isDefinitionTask ? null : await readTaskBriefs(context, [taskID]);

  const brief = isDefinitionTask
    ? await readOpenRunBrief(context, taskID)
    : (started?.get(taskID) ?? null);

  return brief !== null && before !== undefined && brief.sequence >= before ? null : brief;
}

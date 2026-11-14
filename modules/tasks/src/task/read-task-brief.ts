import type { TaskBrief } from '../brief/task-brief';
import type { TasksContext } from '../types';
import { readTaskBriefs } from './read-task-briefs';

// The brief current at `before`, or now. Null for a task with no brief of its own, such as the
// conversation, and for a brief that a later sequence wrote.
export async function readTaskBrief(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  before?: number,
): Promise<TaskBrief | null> {
  const briefs = await readTaskBriefs(context, [taskID]);

  const brief = briefs.get(taskID) ?? null;

  return brief !== null && before !== undefined && brief.sequence >= before ? null : brief;
}

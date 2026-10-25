import type { TaskMessageRequest } from '../plan-task-message';
import type { TaskMessaging, TasksContext, TasksTables } from '../types';
import type { TaskMessageOutcome } from '../write-task-message';
import { writeTaskMessage } from '../write-task-message';

export async function writeTestTaskMessage(
  context: Pick<TasksContext, 'clock' | 'definitions' | 'log'>,
  messaging: Pick<TaskMessaging, 'directory' | 'hopLimit'>,
  request: TaskMessageRequest,
): Promise<TaskMessageOutcome> {
  const step = await context.log.writer.db
    .$extendTables<TasksTables>()
    .selectFrom('tasks')
    .innerJoin('leases', (join) =>
      join.onRef('leases.work_id', '=', 'tasks.task_id').on('leases.kind', '=', 'task'),
    )
    .select(['tasks.started_step_key', 'leases.generation'])
    .where('tasks.task_id', '=', request.from)
    .executeTakeFirstOrThrow();

  return writeTaskMessage(context, messaging, {
    ...request,
    stepRunID: `${step.started_step_key ?? ''}@${step.generation}`,
  });
}

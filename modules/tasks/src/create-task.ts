import { writeRecords } from '@heynixie/log';
import type { TasksContext } from './types';

// Creates a task with its brief, ready for a runner to claim. The brief is free text, so it sits in
// the record's erasable fields. Returns the task ID.
export async function createTask(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  brief: string,
): Promise<string> {
  const taskID = crypto.randomUUID();

  await writeRecords(context.log, [
    {
      kind: 'task.created',
      definitions: context.definitions(),
      thread: taskID,
      payload: { taskID, isConversation: false, state: 'ready' },
      erasable: { brief },
    },
  ]);
  return taskID;
}

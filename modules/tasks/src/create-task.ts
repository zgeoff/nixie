import { writeRecords } from '@heynixie/log';
import { taskCreatedCodec } from './task-created-codec';
import type { TasksContext } from './types';

export async function createTask(
  context: Pick<TasksContext, 'definitions' | 'log'>,
  brief: string,
  taskID: string = crypto.randomUUID(),
): Promise<string> {
  await writeRecords(context.log, [
    {
      kind: 'task.created',
      definitions: context.definitions(),
      thread: taskID,
      payload: taskCreatedCodec.encode({ taskID, isConversation: false, state: 'ready' }),
      erasable: { brief },
    },
  ]);

  return taskID;
}

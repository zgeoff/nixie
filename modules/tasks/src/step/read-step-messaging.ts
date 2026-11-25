import { readTaskDirectory } from '../task/read-task-directory';
import type { TaskMessaging, TasksContext } from '../types';
import { conversationTaskID } from '../utils/conversation-task-id';

// The receivers that a step's messages may name: the conversation and every started or definition
// task. Read before the commit's transaction, because the read waits on the writer.
export function readStepMessaging(
  context: Pick<TasksContext, 'log' | 'readDefinitionVersion' | 'runSettings'>,
): Promise<Pick<TaskMessaging, 'directory' | 'hopLimit'>> {
  return readTaskDirectory(context, {
    hopLimit: context.runSettings.hopLimit,
    directory: [
      {
        taskID: conversationTaskID,
        name: 'Conversation',
        brief: '',
        wakeable: true,
        speaker: 'conversation',
      },
    ],
  });
}

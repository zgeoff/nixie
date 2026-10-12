import { conversationTaskID } from '@heynixie/tasks';
import type { ToolContext } from '@heynixie/tools';
import type { WriteCaller } from './gate-types';

// nixie sets the caller from the run: the conversation's thread gives the conversation as origin,
// any other thread gives a task, and the run's profile gives the model.
export function buildWriteCaller(context: ToolContext): WriteCaller {
  const thread = context.run.thread;

  return {
    origin: thread === conversationTaskID ? 'conversation' : 'task',
    thread,
    taskID: thread,
    runID: context.run.runID,
    model: context.run.model.model,
  };
}

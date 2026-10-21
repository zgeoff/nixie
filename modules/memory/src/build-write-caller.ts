import { conversationTaskID } from '@heynixie/tasks';
import type { ToolContext } from '@heynixie/tools';
import type { WriteCaller } from './gate-types';

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

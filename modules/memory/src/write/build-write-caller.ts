import { conversationTaskID } from '@heynixie/tasks';
import type { ToolContext } from '@heynixie/tools';
import type { WriteCaller } from '../gate/gate-context';

export function buildWriteCaller(context: Pick<ToolContext, 'run'>): WriteCaller {
  const thread = context.run.thread;

  return {
    origin: thread === conversationTaskID ? 'conversation' : 'task',
    thread,
    logThread: context.run.logThread,
    taskID: thread,
    runID: context.run.runID,
    model: context.run.model.model,
    ...(thread !== conversationTaskID && context.run.hasSelfNoteGrant === true
      ? { hasSelfNoteGrant: true }
      : {}),
  };
}

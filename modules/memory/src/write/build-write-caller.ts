import { conversationTaskID } from '@heynixie/tasks';
import type { ToolContext } from '@heynixie/tools';
import type { WriteCaller } from '../gate/gate-context';

export function buildWriteCaller(context: Pick<ToolContext, 'run'>, toolName: string): WriteCaller {
  const run = context.run;

  const fields = {
    thread: run.thread,
    logThread: run.logThread,
    taskID: run.thread,
    runID: run.runID,
    model: run.model.model,
  };

  return run.thread === conversationTaskID
    ? { origin: 'conversation', ...fields }
    : {
        origin: 'task',
        hasSelfNoteGrant: run.hasSelfNoteGrant === true,
        isSelfNoteOnly: run.selfNoteOnlyTools?.includes(toolName) === true,
        ...fields,
      };
}

import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { collectKeptReplies } from './collect-kept-replies';
import { keptReplyKinds } from './kept-reply-kinds';

// The sequence of the newest reply that an aborted turn kept, or null for none. Each message before
// it was read by that turn.
export async function readAnsweredThrough(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<number | null> {
  const records: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(context, taskID, keptReplyKinds)) {
    records.push(record);

    if (record.kind === 'task.step_committed') {
      break;
    }
  }

  return collectKeptReplies(records).at(-1) ?? null;
}

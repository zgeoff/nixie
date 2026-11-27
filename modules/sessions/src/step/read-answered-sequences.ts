import type { LogRecord } from '@heynixie/log';
import { readThreadNewestFirst } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { collectAnsweredSequences } from './collect-answered-sequences';
import { keptReplyKinds } from './kept-reply-kinds';

// The sequences of the inbox records that the replies of an aborted turn answer.
export async function readAnsweredSequences(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
): Promise<ReadonlySet<number>> {
  const records: LogRecord[] = [];

  for await (const record of readThreadNewestFirst(context, taskID, keptReplyKinds)) {
    records.push(record);

    if (record.kind === 'task.step_committed') {
      break;
    }
  }

  return collectAnsweredSequences(records);
}

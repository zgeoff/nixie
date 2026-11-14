import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { taskFailedTurnSpentCodec } from '@heynixie/tasks';

const pageSize = 500;

// The read covers the whole thread past the sequence because task runs do not exist yet.
export async function readLateSpend(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  afterSequence: number,
): Promise<number> {
  let dollars = 0;
  let cursor = afterSequence;
  let isLastPage = false;

  // One read serves the normal case. The loop only keeps a long backlog from undercounting.
  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence: cursor,
      thread: taskID,
      kinds: [taskFailedTurnSpentCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      dollars += taskFailedTurnSpentCodec.decode(entry.record.payload).dollars;
    }

    cursor = page.at(-1)?.record.sequence ?? cursor;
    isLastPage = page.length < pageSize;
  }

  return dollars;
}

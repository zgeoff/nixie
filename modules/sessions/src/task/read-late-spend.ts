import { readRecords } from '@heynixie/log';
import type { TaskRun, TasksContext } from '@heynixie/tasks';
import { taskFailedTurnSpentCodec } from '@heynixie/tasks';

const pageSize = 500;

// Only the spend that names this task run counts, because another task run's spend never shortens
// this one's turn.
export async function readLateSpend(
  context: Pick<TasksContext, 'log'>,
  run: TaskRun,
  afterSequence: number,
): Promise<number> {
  let dollars = 0;
  let cursor = afterSequence;
  let isLastPage = false;

  // One read serves the normal case. The loop only keeps a long backlog from undercounting.
  while (!isLastPage) {
    const page = await readRecords(context.log, {
      afterSequence: cursor,
      thread: run.taskID,
      kinds: [taskFailedTurnSpentCodec.kind],
      limit: pageSize,
    });

    for (const entry of page) {
      const spent = taskFailedTurnSpentCodec.decode(entry.record.payload);

      if (spent.taskRunID === run.runID) {
        dollars += spent.dollars;
      }
    }

    cursor = page.at(-1)?.record.sequence ?? cursor;
    isLastPage = page.length < pageSize;
  }

  return dollars;
}

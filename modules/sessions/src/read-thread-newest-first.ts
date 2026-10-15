import type { LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';

const pageSize = 200;

// Reads the thread's records of the kinds given, newest first, a page at a time, so a reader that
// stops early reads no further back than the page it stopped in.
export async function* readThreadNewestFirst(
  context: Pick<TasksContext, 'log'>,
  taskID: string,
  kinds: readonly string[],
): AsyncGenerator<LogRecord> {
  const page = { before: Number.MAX_SAFE_INTEGER, size: pageSize };

  while (page.size === pageSize) {
    // oxlint-disable-next-line no-await-in-loop -- each page reads on from the one before it
    const entries = await readRecords(context.log, {
      afterSequence: 0,
      beforeSequence: page.before,
      thread: taskID,
      kinds,
      order: 'newest',
      limit: pageSize,
    });

    yield* entries.map((entry) => entry.record);
    page.size = entries.length;
    page.before = entries.at(-1)?.record.sequence ?? 0;
  }
}

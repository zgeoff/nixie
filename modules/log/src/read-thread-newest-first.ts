import { readRecords } from './read-records';
import type { Log, LogRecord, RecordKind } from './types';

const pageSize = 200;

// any context that holds the log, such as a task's
interface LogContext {
  readonly log: Log;
}

// Reads the thread's records of the kinds given, newest first, a page at a time, so a reader that
// stops early reads no further back than the page it stopped in.
export async function* readThreadNewestFirst(
  context: LogContext,
  taskID: string,
  kinds: readonly RecordKind[],
): AsyncGenerator<LogRecord> {
  const page = { before: Number.MAX_SAFE_INTEGER, size: pageSize };

  while (page.size === pageSize) {
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

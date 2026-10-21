import { readRecords } from './read-records';
import type { Log, LogRecord, RecordKind } from './types';

const pageSize = 200;

interface LogContext {
  readonly log: Log;
}

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

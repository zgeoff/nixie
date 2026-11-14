import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

export interface ThreadRecordQuery {
  readonly thread: string;
  readonly sequence: number;
}

export async function readThreadRecord(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: ThreadRecordQuery,
): Promise<LogRecord | null> {
  const [entry] = await readRecords(log, {
    afterSequence: query.sequence - 1,
    beforeSequence: query.sequence + 1,
    thread: query.thread,
    limit: 1,
  });

  return entry?.record ?? null;
}

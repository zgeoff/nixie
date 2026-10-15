import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

// Reads every record of one kind from the start of the log, oldest first.
export async function readRecordsByKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  kind: string,
): Promise<readonly LogRecord[]> {
  const entries = await readRecords(log, { afterSequence: 0 });

  return entries.map((entry) => entry.record).filter((record) => record.kind === kind);
}

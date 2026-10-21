import type { Log, LogRecord } from '@heynixie/log';
import { readRecords } from '@heynixie/log';

export async function readRecordsByKind(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  kind: string,
): Promise<readonly LogRecord[]> {
  const entries = await readRecords(log, { afterSequence: 0 });

  return entries.map((entry) => entry.record).filter((record) => record.kind === kind);
}

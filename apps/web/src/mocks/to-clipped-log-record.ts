import { clipRecordPayloads } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/contract';
import { toLogRecord } from './to-log-record';

type StoredRecord = Parameters<typeof toLogRecord>[0];

export function toClippedLogRecord(
  record: StoredRecord,
  isClipped: boolean | undefined,
): LogRecord {
  const mapped = toLogRecord(record);

  return isClipped === true ? clipRecordPayloads(mapped) : mapped;
}

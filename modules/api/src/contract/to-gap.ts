import type { LogRecord as ContractRecord } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import type { RecordLookups } from './to-contract-record';

// A shredded record shows why its text is gone: a forget removed it, or it grew old and expired.
export function toGap(
  record: LogRecord,
  lookups: RecordLookups,
): Pick<ContractRecord, 'isExpired' | 'isRemoved'> {
  if (record.erasable.status !== 'shredded') {
    return {};
  }

  if (lookups.removedSequences.has(record.sequence)) {
    return { isRemoved: true };
  }

  return lookups.expiredSequences.has(record.sequence) ? { isExpired: true } : {};
}

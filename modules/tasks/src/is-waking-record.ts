import type { EnvelopeRecord } from '@heynixie/log';
import { isInboxRecord } from './is-inbox-record';
import { taskMessageCodec } from './task-message-codec';

export function isWakingRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>,
): boolean {
  if (!isInboxRecord(record)) {
    return false;
  }

  return record.kind !== 'task_message' || taskMessageCodec.decode(record.payload).woke;
}

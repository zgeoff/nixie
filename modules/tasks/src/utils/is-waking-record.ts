import type { EnvelopeRecord } from '@heynixie/log';
import { isInboxRecord } from './is-inbox-record';
import { taskMessageCodec } from './task-message-codec';

export function isWakingRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>,
): boolean {
  if (!isInboxRecord(record)) {
    return false;
  }

  // The conversation reads the restore notice with the owner's next message, so it wakes no step.
  if (record.kind === 'recovery.notice') {
    return false;
  }

  return record.kind !== 'task_message' || taskMessageCodec.decode(record.payload).woke;
}

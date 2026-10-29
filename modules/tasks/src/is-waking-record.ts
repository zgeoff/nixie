import type { EnvelopeRecord } from '@heynixie/log';
import { isInboxRecord } from './is-inbox-record';
import { taskMessageCodec } from './task-message-codec';
import { taskMessageMovedCodec } from './task-message-moved-codec';

export function isWakingRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>,
): boolean {
  if (!isInboxRecord(record)) {
    return false;
  }

  if (record.kind === 'task.message_moved') {
    return taskMessageMovedCodec.decode(record.payload).to === record.thread;
  }

  return record.kind !== 'task_message' || taskMessageCodec.decode(record.payload).woke;
}

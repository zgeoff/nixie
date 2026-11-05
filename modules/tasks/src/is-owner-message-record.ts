import type { EnvelopeRecord } from '@heynixie/log';
import { taskMessageMovedCodec } from './task-message-moved-codec';

// The task that lost a moved message reads a notice too, and that notice asks it to leave the
// message alone, so only the task that gained it holds the owner's message.
export function isOwnerMessageRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'payload' | 'thread'>,
): boolean {
  if (record.kind === 'task.message_moved') {
    return taskMessageMovedCodec.decode(record.payload).to === record.thread;
  }

  return record.kind === 'owner_message';
}

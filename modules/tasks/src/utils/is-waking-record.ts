import type { EnvelopeRecord } from '@heynixie/log';
import { isInboxRecord } from './is-inbox-record';
import { isQueuedApproval } from './is-queued-approval';
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

  // A person taking the desktop wakes nothing: the assistant reads that with its next input, and
  // its queued acts stay pending until the desktop comes back, which does wake it.
  // the connectors module registers this kind, and tasks depends on no connector
  const kind: string = record.kind;

  if (kind === 'computer.takeover_started') {
    return false;
  }

  if (isQueuedApproval(record)) {
    return false;
  }

  return record.kind !== 'task_message' || taskMessageCodec.decode(record.payload).woke;
}

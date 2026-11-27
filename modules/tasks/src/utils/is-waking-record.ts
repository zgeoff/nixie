import type { EnvelopeRecord } from '@heynixie/log';
import { inboxKinds } from './inbox-kinds';
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
  // The wait notice is read with the step that the clear resumes, so it wakes no step of its own.
  if (record.kind === 'recovery.notice' || record.kind === 'spend.wait_notice') {
    return false;
  }

  // A change to a tool applies at once, so its note waits for the conversation's next turn.
  if (record.kind === 'tool_changed') {
    return false;
  }

  // A kind that a feature adds says for itself whether it wakes.
  const added = inboxKinds.byKind(record.kind);

  if (added !== null) {
    return added.wakes(record.payload);
  }

  const kind: string = record.kind;

  // The call's own thread: what the user said and the speech layer said is read with the next
  // hand-off, which alone starts a turn.
  if (kind === 'call.spoke' || kind === 'call.heard_cut') {
    return false;
  }

  if (record.kind === 'owner_message' && record.payload['isDictated'] === true) {
    return false;
  }

  if (isQueuedApproval(record)) {
    return false;
  }

  return record.kind !== 'task_message' || taskMessageCodec.decode(record.payload).woke;
}

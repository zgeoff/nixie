import type { EnvelopeRecord } from '@heynixie/log';

// An approval that queued or released an action. The action's outcome tells the task about it, with
// the approval's time, so the approval itself wakes nothing and shows no message.
export function isQueuedApproval(record: Pick<EnvelopeRecord, 'kind' | 'payload'>): boolean {
  return (
    record.kind === 'policy.action_answered' &&
    record.payload['answer'] === 'approved' &&
    typeof record.payload['actionID'] === 'string'
  );
}

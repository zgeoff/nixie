import type { EnvelopeRecord } from '@heynixie/log';

const inboxKinds: ReadonlySet<string> = new Set([
  'owner_message',
  'timer.fired',
  'action.outcome',
  'task.wake',
  'task_message',
  'task.limit_notice',
  'policy.action_answered',
  'memory.proposal_rejected',
  'skills.write_rejected',
  'proposals.deferred',
  'proposals.returned',
]);

export function isInboxRecord(record: Pick<EnvelopeRecord, 'kind' | 'thread'>): boolean {
  return record.thread !== null && inboxKinds.has(record.kind);
}

import type { EnvelopeRecord, RecordKind } from '@heynixie/log';

const inboxKinds: ReadonlySet<RecordKind> = new Set([
  'owner_message',
  'timer.fired',
  'action.outcome',
  'task.wake',
  'task_message',
  'task.limit_notice',
  'policy.action_answered',
]);

export function isInboxRecord(record: Pick<EnvelopeRecord, 'kind' | 'thread'>): boolean {
  return record.thread !== null && inboxKinds.has(record.kind);
}

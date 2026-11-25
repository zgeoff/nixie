import type { EnvelopeRecord } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';

const inboxKinds: ReadonlySet<string> = new Set([
  'owner_message',
  'timer.fired',
  'action.outcome',
  'task.wake',
  'task_message',
  'trigger.fired',
  'task.limit_notice',
  'recovery.notice',
  'spend.wait_notice',
  'policy.action_answered',
  'memory.proposal_rejected',
  'skills.write_rejected',
  'proposals.deferred',
  'proposals.returned',
  'computer.takeover_started',
  'computer.takeover_ended',
  'computer.handover_asked',
  'computer.handover_closed',
  'device.status_changed',
]);

// The conversation reads these 2 in its turns' events block, so as inbox records too they would
// reach it twice.
const declineKinds: ReadonlySet<string> = new Set([
  'memory.proposal_rejected',
  'skills.write_rejected',
]);

export function isInboxRecord(record: Pick<EnvelopeRecord, 'kind' | 'thread'>): boolean {
  if (record.thread === conversationTaskID && declineKinds.has(record.kind)) {
    return false;
  }

  return record.thread !== null && inboxKinds.has(record.kind);
}

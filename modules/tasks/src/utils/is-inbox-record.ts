import type { EnvelopeRecord } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';
import { inboxKinds } from './inbox-kinds';

const coreInboxKinds: ReadonlySet<string> = new Set([
  'owner_message',
  'timer.fired',
  'action.outcome',
  'task.wake',
  'task_message',
  'trigger.fired',
  'trigger.mail_woke',
  'task.limit_notice',
  'recovery.notice',
  'spend.wait_notice',
  'policy.action_answered',
  'proposals.settled',
  'proposals.deferred',
  'proposals.returned',
  'tool_changed',
]);

export function isInboxRecord(
  record: Pick<EnvelopeRecord, 'kind' | 'thread'> & Partial<Pick<EnvelopeRecord, 'payload'>>,
): boolean {
  // The conversation reads a settlement in the note of its next turn, so as an inbox record it
  // would reach it twice. A task hears an action's own outcome in place of a settlement.
  if (record.kind === 'proposals.settled') {
    return (
      record.thread !== null &&
      record.thread !== conversationTaskID &&
      record.payload?.['family'] !== 'action' &&
      record.payload?.['byProposer'] !== true
    );
  }

  // An event of a source that names its task is in the inbox only when it wakes the task, and a
  // record that arrives without its payload is no such event.
  if (record.kind === 'trigger.task_input') {
    return record.thread !== null && record.payload?.['wake'] === true;
  }

  if (record.thread === null) {
    return false;
  }

  if (coreInboxKinds.has(record.kind)) {
    return true;
  }

  // A kind that a feature adds says for itself which of its records are in the inbox, and a record
  // that arrives without its payload is none of those.
  const added = inboxKinds.byKind(record.kind);

  if (added === null) {
    return false;
  }

  return (
    added.isInbox === undefined || (record.payload !== undefined && added.isInbox(record.payload))
  );
}

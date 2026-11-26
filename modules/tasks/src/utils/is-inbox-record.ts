import type { EnvelopeRecord } from '@heynixie/log';
import { conversationTaskID } from './conversation-task-id';

const inboxKinds: ReadonlySet<string> = new Set([
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
  'computer.takeover_started',
  'computer.takeover_ended',
  'computer.handover_asked',
  'computer.handover_closed',
  'device.status_changed',
  'tool_changed',
  'call.started',
  'call.answered',
  'call.ended',
  'call.spoke',
  'call.handed_off',
  'call.heard_cut',
  'call.closing',
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

  // A page event is in the inbox only when its wake was kept. One without it waits in the events
  // block of the conversation's next turn, which would otherwise show it twice. Devices registers
  // this kind, and tasks depends on no device.
  const kind: string = record.kind;

  if (kind === 'device.page_event') {
    return record.thread !== null && record.payload?.['wake'] === true;
  }

  // An event of a source that names its task is in the inbox only when it wakes the task, and a
  // record that arrives without its payload is no such event.
  if (record.kind === 'trigger.task_input') {
    return record.thread !== null && record.payload?.['wake'] === true;
  }

  return record.thread !== null && inboxKinds.has(record.kind);
}

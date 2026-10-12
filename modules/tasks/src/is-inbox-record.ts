import type { EnvelopeRecord } from '@heynixie/log';

// A record is in a task's inbox when its thread names the task and its kind is task input: your
// message, a fired timer, an action outcome, or a wake that tells a system task such as the memory
// writer that work arrived on another thread. A step's own records stay out of the inbox.
export function isInboxRecord(record: Pick<EnvelopeRecord, 'kind' | 'thread'>): boolean {
  return record.thread !== null && inboxKinds.has(record.kind);
}

const inboxKinds: ReadonlySet<string> = new Set([
  'owner_message',
  'timer.fired',
  'action.outcome',
  'task.wake',
]);

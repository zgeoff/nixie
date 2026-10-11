import type { EnvelopeRecord } from '@heynixie/log';

// A record is in a task's inbox when its thread names the task and its kind is one that a task
// reads as input: your message, a fired timer or an action outcome. A step's own records share the
// thread and stay out of the inbox.
export function isInboxRecord(record: Pick<EnvelopeRecord, 'kind' | 'thread'>): boolean {
  return record.thread !== null && inboxKinds.has(record.kind);
}

const inboxKinds: ReadonlySet<string> = new Set(['owner_message', 'timer.fired', 'action.outcome']);

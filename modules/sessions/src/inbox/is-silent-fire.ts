import type { LogRecord } from '@heynixie/log';
import { conversationTaskID } from '@heynixie/tasks';

// A fire on a task's own thread opens its task run, which the run's trigger block already tells the
// model, so it renders no text. The conversation's fire renders as a reminder.
export function isSilentFire(record: Pick<LogRecord, 'kind' | 'thread'>): boolean {
  return record.kind === 'trigger.fired' && record.thread !== conversationTaskID;
}

import type { LogRecord } from '@heynixie/log';
import { isQueuedApproval } from '@heynixie/tasks';
import { isSilentFire } from './is-silent-fire';

// An inbox record that a turn takes and renders no text for. The speech layer's small talk shows in
// the hand-off that follows it. An approval that queued an action, and the wake that starts the
// step running it, leave the action's outcome to tell the model, once.
export function isSilentRecord(record: Pick<LogRecord, 'kind' | 'thread' | 'payload'>): boolean {
  return (
    isSilentFire(record) ||
    record.kind === 'call.spoke' ||
    isQueuedApproval(record) ||
    (record.kind === 'task.wake' && typeof record.payload['actionID'] === 'string')
  );
}

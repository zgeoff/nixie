import type { LogRecord } from '@heynixie/log';
import { isQueuedApproval } from '@heynixie/tasks';
import { isSilentFire } from './is-silent-fire';

// An inbox record that a turn takes and renders no text for. An approval that queued an action, and
// the wake that starts the step running it, leave the action's outcome to tell the model, once. The
// assistant wrote its own handover ask and its withdrawal in the turn, so the turn has them.
export function isSilentRecord(record: Pick<LogRecord, 'kind' | 'thread' | 'payload'>): boolean {
  return (
    isSilentFire(record) ||
    isQueuedApproval(record) ||
    (record.kind === 'task.wake' && typeof record.payload['actionID'] === 'string') ||
    record.kind === 'computer.handover_asked' ||
    (record.kind === 'computer.handover_closed' && record.payload['by'] === 'assistant')
  );
}

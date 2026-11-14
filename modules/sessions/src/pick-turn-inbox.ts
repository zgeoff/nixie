import type { LogRecord } from '@heynixie/log';
import { isBriefRecord } from '@heynixie/tasks';
import { inboxBatchLimit } from './inbox-batch-limit';

// The records that one turn renders. A brief ends its batch, so the model acts on its work before
// it reads a message that landed behind it, and the next turn renders the rest.
export function pickTurnInbox(inbox: readonly LogRecord[]): readonly LogRecord[] {
  const brief = inbox.findIndex((record) => isBriefRecord(record));
  const cut = brief === -1 ? inbox : inbox.slice(0, brief + 1);

  return cut.slice(0, inboxBatchLimit);
}

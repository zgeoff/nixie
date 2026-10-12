import type { LogRecord } from '@heynixie/log';
import { renderHistoryLine } from './render-history-line';

// Renders a rebuilt session's history, which goes first in its first turn, or nothing when the
// thread holds no earlier turn.
export function renderSessionHistory(records: readonly LogRecord[]): string | null {
  if (records.length === 0) {
    return null;
  }
  return [
    '<conversation-history>',
    'This session was rebuilt from nixie records after the earlier one was lost. These are the most recent turns before the new message, oldest first, word for word; older turns are left out.',
    ...records.map((record) => renderHistoryLine(record)),
    '</conversation-history>',
  ].join('\n');
}

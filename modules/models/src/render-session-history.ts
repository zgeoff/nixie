import type { HistoryTurn } from './read-recent-turns';
import { renderHistoryLine } from './render-history-line';
import type { MessageTimeOptions } from './types';

// Renders a rebuilt session's history, which goes first in its first turn, or nothing when the
// thread holds no earlier turn.
export function renderSessionHistory(
  turns: readonly HistoryTurn[],
  times: MessageTimeOptions,
): string | null {
  if (turns.length === 0) {
    return null;
  }
  return [
    '<conversation-history>',
    'This session was rebuilt from nixie records after the earlier one was lost. These are the most recent turns before the new message, oldest first, word for word; older turns are left out.',
    ...turns.map((turn) => renderHistoryLine(turn, times)),
    '</conversation-history>',
  ].join('\n');
}

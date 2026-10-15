import type { HistoryTurn } from './read-recent-turns';
import { renderHistoryLine } from './render-history-line';
import type { MessageTimeOptions } from './types';

// Renders the body of a new session's recent-turns message, or nothing when the thread holds no
// turn after the summary.
export function renderSessionHistory(
  turns: readonly HistoryTurn[],
  times: MessageTimeOptions,
): string | null {
  if (turns.length === 0) {
    return null;
  }

  return [
    'The most recent turns before this session, oldest first, word for word. Older turns are in the event log.',
    ...turns.map((turn) => renderHistoryLine(turn, times)),
  ].join('\n');
}

import type { HistoryTurn } from './read-recent-turns';
import { renderHistoryLine } from './render-history-line';
import type { MessageTimeOptions } from './types';

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

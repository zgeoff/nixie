import { mintBlockID } from '@heynixie/wire';
import type { TaskMessageView } from '../task/render-task-message';
import type { HistoryTurn } from '../turn/read-recent-turns';
import { renderHistoryLine } from '../turn/render-history-line';
import type { MessageTimeOptions } from '../types';

export function renderSessionHistory(
  turns: readonly HistoryTurn[],
  times: MessageTimeOptions,
  view: Pick<TaskMessageView, 'messaging'>,
  mint: () => string = mintBlockID,
): string | null {
  if (turns.length === 0) {
    return null;
  }

  return [
    'The most recent turns before this session, oldest first, word for word. Older turns are in the event log.',
    ...turns.map((turn) => renderHistoryLine(turn, times, view, mint)),
  ].join('\n');
}

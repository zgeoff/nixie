import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import type { MessageTimeOptions } from './types';

// Renders when each reply of the last turn was sent, in a message stamp's format and the zone of the
// message it answers, since a resumed session's own copy of a reply has no time. Each reply shows
// by its opening words, so the model can tell them apart; a turn with no reply renders nothing.
export function renderReplyTimes(
  turns: readonly HistoryTurn[],
  times: MessageTimeOptions,
): string | null {
  if (turns.length === 0) {
    return null;
  }
  return [
    '<reply-times>',
    'Your replies in your last turn, each with the time it was sent:',
    ...turns.map(
      (turn) =>
        `[${formatMessageTime(turn.record.recordedAt, turn.answered?.payload['timeZone'], times)}] ${renderOpening(turn)}`,
    ),
    '</reply-times>',
  ].join('\n');
}

// a reply's first words show it, and a forgotten reply keeps its place with a note
const openingWords = 8;

function renderOpening(turn: HistoryTurn): string {
  const record = turn.record;
  const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

  if (typeof text !== 'string') {
    return '[a reply, since forgotten]';
  }
  const words = text.split(/\s+/u).filter((word) => word !== '');

  return words.length > openingWords
    ? `${words.slice(0, openingWords).join(' ')} …`
    : words.join(' ');
}

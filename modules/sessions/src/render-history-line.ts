import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import { renderImageMarkers } from './render-image-markers';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders one record as a line of a rebuilt session's history: its event ID, the time, who spoke and
// the words. Your message shows its session label and a marker line per image, never the bytes; a
// reply's time is in its message's zone, and a forgotten reply keeps its place with a note.
export function renderHistoryLine(turn: HistoryTurn, times: MessageTimeOptions): string {
  const record = turn.record;

  if (record.kind === 'model.reply') {
    const time = formatMessageTime(record.recordedAt, turn.answered?.payload['timeZone'], times);
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${record.sequence} · ${time}] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }

  const words = `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record)}`;

  return [words, ...renderImageMarkers(record)].join('\n');
}

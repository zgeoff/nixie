import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders one record of the conversation as a line of a rebuilt session's history: the record's event
// ID, the time, who spoke, and the words. Your message shows its session's label, and a reply's time is in the zone
// of the message it answers. A forgotten reply keeps its place with a note, as a message does.
export function renderHistoryLine(turn: HistoryTurn, times: MessageTimeOptions): string {
  const record = turn.record;

  if (record.kind === 'model.reply') {
    const time = formatMessageTime(record.recordedAt, turn.answered?.payload['timeZone'], times);
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${record.sequence} · ${time}] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }

  return `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record)}`;
}

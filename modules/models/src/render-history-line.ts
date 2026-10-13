import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders one record of the conversation as a line of a rebuilt session's history: the time, who
// spoke, and the words. Your message's time is in your zone, as the inbox renders it, and a reply's
// is in UTC, labelled so. A forgotten reply keeps its place with a note, as a message does.
export function renderHistoryLine(record: LogRecord, times: MessageTimeOptions): string {
  if (record.kind === 'model.reply') {
    const time = record.recordedAt.toISOString().slice(0, 16).replace('T', ' ');
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[${time} UTC] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }
  return `[${formatMessageTime(record, times)}] owner: ${renderOwnerText(record)}`;
}

import type { LogRecord } from '@heynixie/log';
import { renderInboxMessage } from './render-inbox-message';

// Renders one record of the conversation as a line of a rebuilt session's history: the time, who
// spoke, and the words. A forgotten reply keeps its place with a note, as a forgotten message does.
export function renderHistoryLine(record: LogRecord): string {
  const time = record.recordedAt.toISOString().slice(0, 16).replace('T', ' ');

  if (record.kind === 'model.reply') {
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[${time}] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }
  return `[${time}] owner: ${renderInboxMessage(record)}`;
}

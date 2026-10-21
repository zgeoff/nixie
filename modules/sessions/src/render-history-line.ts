import { ownerMessageCodec } from '@heynixie/tasks';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import { renderImageMarkers } from './render-image-markers';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

export function renderHistoryLine(turn: HistoryTurn, times: MessageTimeOptions): string {
  const record = turn.record;

  if (record.kind === 'model.reply') {
    const answered =
      turn.answered === null ? null : ownerMessageCodec.tryDecodePartial(turn.answered.payload);

    const time = formatMessageTime(record.recordedAt, answered?.timeZone, times);
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${record.sequence} · ${time}] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }

  const words = `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record)}`;

  return [words, ...renderImageMarkers(record)].join('\n');
}

import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec, taskMessageCodec } from '@heynixie/tasks';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import { renderImageMarkers } from './render-image-markers';
import { renderOwnerText } from './render-owner-text';
import { renderTaskMessageElement } from './render-task-message-element';
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

  if (record.kind === 'task_message') {
    return renderTaskHistoryLine(record, times);
  }

  const words = `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record)}`;

  return [words, ...renderImageMarkers(record)].join('\n');
}

function renderTaskHistoryLine(record: LogRecord, times: MessageTimeOptions): string {
  const message = taskMessageCodec.decode(record.payload);
  const time = formatMessageTime(record.recordedAt, null, times);
  const body = record.erasable.status === 'readable' ? record.erasable.fields['body'] : undefined;

  const element = renderTaskMessageElement(
    [
      ['id', message.messageID],
      ['from', message.from],
      ['kind', message.kind],
      ...(message.replyTo === null ? [] : [['reply-to', message.replyTo] as const]),
      ...(message.onBehalfOf.length === 0
        ? []
        : [
            ['on-behalf-of', message.onBehalfOf.map((eventID) => `#${eventID}`).join(' ')] as const,
          ]),
    ],
    [
      'This message is from another task, not from the owner.',
      typeof body === 'string' ? body : '[a message since forgotten]',
    ],
  );

  return `[#${record.sequence} · ${time}] task ${message.from}:\n${element}`;
}

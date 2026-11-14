import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec, taskMessageCodec } from '@heynixie/tasks';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import type { HistoryTurn } from './read-recent-turns';
import { renderImageMarkers } from './render-image-markers';
import { renderOwnerText } from './render-owner-text';
import { renderTaskMessage } from './render-task-message';
import type { TaskMessageView } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderHistoryLine(
  turn: HistoryTurn,
  times: MessageTimeOptions,
  view: Pick<TaskMessageView, 'messaging'>,
): string {
  const record = turn.record;

  if (record.kind === 'model.reply') {
    const answered =
      turn.answered === null ? null : ownerMessageCodec.tryDecodePartial(turn.answered.payload);

    const time = formatMessageTime(record.recordedAt, answered?.timeZone, times);
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${record.sequence} · ${time}] nixie: ${typeof text === 'string' ? text : '[a reply, since forgotten]'}`;
  }

  if (record.kind === 'task_message') {
    return turn.isSent === true
      ? renderSentHistoryLine(record, times)
      : renderTaskMessage(record, times, view);
  }

  const words = `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record)}`;

  return [words, ...renderImageMarkers(record)].join('\n');
}

function renderSentHistoryLine(record: LogRecord, times: MessageTimeOptions): string {
  const message = taskMessageCodec.decode(record.payload);
  const time = formatMessageTime(record.recordedAt, null, times);
  const body = record.erasable.status === 'readable' ? record.erasable.fields['body'] : undefined;
  const text = typeof body === 'string' ? body : '[a message since forgotten]';

  return `[#${record.sequence} · ${time}] nixie, to task ${message.to} (${message.kind}): ${text}`;
}

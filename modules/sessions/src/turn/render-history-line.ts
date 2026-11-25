import { callSpokeCodec } from '@heynixie/calls';
import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec, taskMessageCodec } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';
import { formatMessageStamp } from '../message/format-message-stamp';
import { formatMessageTime } from '../message/format-message-time';
import { renderTaskMessage } from '../task/render-task-message';
import type { TaskMessageView } from '../task/render-task-message';
import type { MessageTimeOptions } from '../types';
import { renderImageMarkers } from '../utils/render-image-markers';
import { renderOwnerText } from '../utils/render-owner-text';
import type { HistoryTurn } from './read-recent-turns';

export function renderHistoryLine(
  turn: HistoryTurn,
  times: MessageTimeOptions,
  view: Pick<TaskMessageView, 'messaging'>,
  mint: () => string = mintBlockID,
): string {
  const record = turn.record;

  if (record.kind === 'call.spoke') {
    const spoke = callSpokeCodec.decode(record.payload);
    const said = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${spoke.lineID} · ${formatMessageTime(record.recordedAt, null, times)}] speech layer, small talk: ${typeof said === 'string' ? said : '[a line, since forgotten]'}`;
  }

  if (record.kind === 'model.reply') {
    const answered =
      turn.answered === null ? null : ownerMessageCodec.tryDecodePartial(turn.answered.payload);

    const time = formatMessageTime(record.recordedAt, answered?.timeZone, times);
    const text = record.erasable.status === 'readable' ? record.erasable.fields['text'] : undefined;

    return `[#${record.sequence} · ${time}] nixie: ${renderReplyText(text, turn.heardChars)}`;
  }

  if (record.kind === 'task_message') {
    return turn.isSent === true
      ? renderSentHistoryLine(record, times)
      : renderTaskMessage(record, times, view, mint);
  }

  const words = `[${formatMessageStamp(record, times)}] owner: ${renderOwnerText(record, mint)}`;

  return [words, ...renderImageMarkers(record, mint)].join('\n');
}

// A reply that the user talked over shows up to the point they heard, then marks the rest.
function renderReplyText(text: unknown, heardChars: number | undefined): string {
  if (typeof text !== 'string') {
    return '[a reply, since forgotten]';
  }

  return heardChars === undefined
    ? text
    : `${text.slice(0, heardChars)} [the user talked over the reply here and did not hear: ${JSON.stringify(text.slice(heardChars))}]`;
}

function renderSentHistoryLine(record: LogRecord, times: MessageTimeOptions): string {
  const message = taskMessageCodec.decode(record.payload);
  const time = formatMessageTime(record.recordedAt, null, times);
  const body = record.erasable.status === 'readable' ? record.erasable.fields['body'] : undefined;
  const text = typeof body === 'string' ? body : '[a message since forgotten]';

  return `[#${record.sequence} · ${time}] nixie, to task ${message.to} (${message.kind}): ${text}`;
}

import type { LogRecord } from '@heynixie/log';
import { getTaskName, taskMessageMovedCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { TaskMessageView } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderMovedMessage(
  moved: LogRecord,
  original: LogRecord | null,
  times: MessageTimeOptions,
  view: Pick<TaskMessageView, 'messaging'>,
): string {
  const move = taskMessageMovedCodec.decode(moved.payload);
  const owner = view.messaging.ownerName ?? 'the owner';
  const at = formatMessageTime(moved.recordedAt, null, times);

  if (moved.thread !== move.to) {
    return renderSystemMessage({
      type: 'message-moved',
      at,
      body: `${owner} moved their message #${move.message} to ${getTaskName(view.messaging, move.to)}, which answers it now. Leave it to that task.`,
    });
  }

  const notice = renderSystemMessage({
    type: 'message-moved',
    at,
    body: `${owner} moved their message #${move.message} to you from ${getTaskName(view.messaging, move.from)}, as if it had come to you first. Answer it.`,
  });

  const text =
    original === null
      ? '[a message you sent, since forgotten]'
      : `[${formatMessageStamp(original, times)}] ${renderOwnerText(original)}`;

  return `${notice}\n\n${text}`;
}

import type { LogRecord } from '@heynixie/log';
import type { TaskMessaging } from '@heynixie/tasks';
import { getTaskName, taskLimitNoticeCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

export function renderLimitNotice(
  record: LogRecord,
  times: MessageTimeOptions,
  messaging: TaskMessaging,
): string {
  const notice = taskLimitNoticeCodec.decode(record.payload);
  const owner = messaging.ownerName ?? 'the owner';
  const name = getTaskName(messaging, notice.taskID);

  return renderSystemMessage({
    type: 'task-limit',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] The ${name} task (${notice.taskID}) paused at its limit: it used ` +
      `${String(notice.used.turns)} of its ${String(notice.limits.turns)} turns and ` +
      `$${notice.used.dollars.toFixed(2)} of its $${notice.limits.dollars.toFixed(2)}. Only ` +
      `${owner} can resume it, by raising its limit, so tell ${owner} when its work needs more.`,
  });
}

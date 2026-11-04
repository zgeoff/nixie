import type { LogRecord } from '@heynixie/log';
import { taskLimitNoticeCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// A task's name comes from a model, so the notice names the task only by its ID: the system
// message is text the model trusts as nixie's own.
export function renderLimitNotice(
  record: LogRecord,
  times: MessageTimeOptions,
  ownerName: string | null,
): string {
  const notice = taskLimitNoticeCodec.decode(record.payload);
  const owner = ownerName ?? 'the owner';

  return renderSystemMessage({
    type: 'task-limit',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] Task ${notice.taskID} paused at its limit: it used ` +
      `${String(notice.used.turns)} of its ${String(notice.limits.turns)} turns and ` +
      `$${notice.used.dollars.toFixed(2)} of its $${notice.limits.dollars.toFixed(2)}. Only ` +
      `${owner} can resume it, by raising its limit, so tell ${owner} when its work needs more.`,
  });
}

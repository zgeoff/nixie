import type { LogRecord } from '@heynixie/log';
import { renderLimitedSummary, taskMessageCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { TaskMessageView } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderHeldMessages(
  records: readonly LogRecord[],
  times: MessageTimeOptions,
  view: TaskMessageView,
): string | null {
  const counts = new Map<string, number>();

  for (const record of records) {
    const message = record.kind === 'task_message' ? taskMessageCodec.decode(record.payload) : null;

    if (message !== null && message.wake && !message.woke && message.hop > message.hopLimit) {
      counts.set(message.from, (counts.get(message.from) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return null;
  }

  const lines = [...counts].map(([senderID, count]) =>
    renderLimitedSummary(view.messaging, { senderID, count, wake: view.wake }),
  );

  return renderSystemMessage({
    type: 'task-messages',
    at: formatMessageTime(times.now, null, times),
    body: lines.join('\n'),
  });
}

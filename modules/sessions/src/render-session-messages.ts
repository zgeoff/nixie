import type { LogRecord } from '@heynixie/log';
import { renderHeldMessages } from './render-held-messages';
import type { TaskMessageView } from './render-task-message';
import { renderTaskMessage } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderSessionMessages(
  inbox: readonly LogRecord[],
  times: MessageTimeOptions,
  view: TaskMessageView,
): string | null {
  const messages = inbox.filter((record) => record.kind === 'task_message');

  if (messages.length === 0) {
    return null;
  }

  const held = renderHeldMessages(messages, times, view);
  const blocks = messages.map((record) => renderTaskMessage(record, times, view));

  return (held === null ? blocks : [held, ...blocks]).join('\n\n');
}

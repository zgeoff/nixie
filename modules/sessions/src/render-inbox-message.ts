import type { LogRecord } from '@heynixie/log';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { TaskMessageView } from './render-task-message';
import { renderTaskMessage } from './render-task-message';
import type { MessageTimeOptions } from './types';

export function renderInboxMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
): string {
  if (record.kind === 'owner_message') {
    return `[${formatMessageStamp(record, times)}] ${renderOwnerText(record)}`;
  }

  if (record.kind === 'task_message') {
    return renderTaskMessage(record, times, view);
  }

  if (record.kind === 'timer.fired') {
    return renderRecordMessage(record, 'timer', times);
  }

  if (record.kind === 'action.outcome') {
    return renderRecordMessage(record, 'outcome', times);
  }

  return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
}

type RecordMessageType = Extract<SystemMessageType, 'timer' | 'outcome'>;

const recordSummaries = { timer: 'A timer fired', outcome: 'An action settled' } as const;

function renderRecordMessage(
  record: LogRecord,
  type: RecordMessageType,
  times: MessageTimeOptions,
): string {
  return renderSystemMessage({
    type,
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[#${record.sequence}] ${recordSummaries[type]}: ${JSON.stringify(record.payload)}`,
  });
}

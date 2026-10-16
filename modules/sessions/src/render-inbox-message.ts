import type { LogRecord } from '@heynixie/log';
import type { SystemMessageType } from '@heynixie/wire';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders an inbox record so the model knows when it arrived and can cite it: your message after
// its event ID, time and session label, or a fired timer or an action's outcome as a system message
// whose body leads with the event ID. Any other kind, such as a wake, reads as its kind and payload.
export function renderInboxMessage(record: LogRecord, times: MessageTimeOptions): string {
  if (record.kind === 'owner_message') {
    return `[${formatMessageStamp(record, times)}] ${renderOwnerText(record)}`;
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

// a timer or an outcome carries no zone of its own, so its time reads in the default zone, as a
// message with no zone does
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

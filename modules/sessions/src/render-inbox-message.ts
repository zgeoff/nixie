import type { LogRecord } from '@heynixie/log';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { SystemMessageType } from './render-system-message';
import { renderSystemMessage } from './render-system-message';
import type { MessageTimeOptions } from './types';

// Renders an inbox record so the model knows when it arrived and can cite it: your message after
// its event ID, time and session label, or a fired timer or an action's outcome as a system message
// whose body leads with the event ID.
export function renderInboxMessage(record: LogRecord, times: MessageTimeOptions): string {
  switch (record.kind) {
    case 'owner_message': {
      return `[${formatMessageStamp(record, times)}] ${renderOwnerText(record)}`;
    }
    case 'timer.fired': {
      return renderRecordMessage(record, 'timer', times);
    }
    case 'action.outcome': {
      return renderRecordMessage(record, 'outcome', times);
    }
    default: {
      return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
    }
  }
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

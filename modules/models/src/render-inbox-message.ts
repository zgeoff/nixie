import type { LogRecord } from '@heynixie/log';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders an inbox record as the text the model reads after its event ID and the time it arrived:
// your message as you wrote it, with the label of the session you sent it from, or a short line for
// a fired timer or an action's outcome, so the model knows when each input arrived and can cite it.
export function renderInboxMessage(record: LogRecord, times: MessageTimeOptions): string {
  switch (record.kind) {
    case 'owner_message': {
      return `[${formatMessageStamp(record, times)}] ${renderOwnerText(record)}`;
    }
    case 'timer.fired': {
      return `[${formatRecordStamp(record, times)}] A timer fired: ${JSON.stringify(record.payload)}`;
    }
    case 'action.outcome': {
      return `[${formatRecordStamp(record, times)}] An action settled: ${JSON.stringify(record.payload)}`;
    }
    default: {
      return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
    }
  }
}

// a timer or an outcome carries no zone of its own, so it reads in the default zone, as a message
// with no zone does
function formatRecordStamp(record: LogRecord, times: MessageTimeOptions): string {
  return `#${record.sequence} · ${formatMessageTime(record.recordedAt, null, times)}`;
}

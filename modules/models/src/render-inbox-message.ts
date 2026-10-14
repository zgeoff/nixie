import type { LogRecord } from '@heynixie/log';
import { formatMessageStamp } from './format-message-stamp';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders an inbox record as the text the model reads: your message as you wrote it, after the time
// you sent it and the label of the session you sent it from, and a short line for a fired timer or
// an action's outcome, after the time it was recorded, so the model knows when each input arrived.
export function renderInboxMessage(record: LogRecord, times: MessageTimeOptions): string {
  switch (record.kind) {
    case 'owner_message': {
      return `[${formatMessageStamp(record, times)}] ${renderOwnerText(record)}`;
    }
    case 'timer.fired': {
      return `[${formatRecordTime(record, times)}] A timer fired: ${JSON.stringify(record.payload)}`;
    }
    case 'action.outcome': {
      return `[${formatRecordTime(record, times)}] An action settled: ${JSON.stringify(record.payload)}`;
    }
    default: {
      return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
    }
  }
}

// a timer or an outcome carries no zone of its own, so it reads in the default zone, as a message
// with no zone does
function formatRecordTime(record: LogRecord, times: MessageTimeOptions): string {
  return formatMessageTime(record.recordedAt, null, times);
}

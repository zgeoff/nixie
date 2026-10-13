import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import { renderOwnerText } from './render-owner-text';
import type { MessageTimeOptions } from './types';

// Renders an inbox record as the text the model reads: your message as you wrote it, after the time
// you sent it, and a short line for a fired timer or an action's outcome.
export function renderInboxMessage(record: LogRecord, times: MessageTimeOptions): string {
  switch (record.kind) {
    case 'owner_message': {
      return `[${formatMessageTime(record, times)}] ${renderOwnerText(record)}`;
    }
    case 'timer.fired': {
      return `A timer fired: ${JSON.stringify(record.payload)}`;
    }
    case 'action.outcome': {
      return `An action settled: ${JSON.stringify(record.payload)}`;
    }
    default: {
      return `A ${record.kind} record arrived: ${JSON.stringify(record.payload)}`;
    }
  }
}

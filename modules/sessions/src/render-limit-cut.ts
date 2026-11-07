import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// The task reads this only once a raise resumed it, so the message tells the model to go on with
// the work its last turn left.
export function renderLimitCut(record: LogRecord, times: MessageTimeOptions): string {
  return renderSystemMessage({
    type: 'task-limit',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] Your last turn stopped at your dollar limit before its work was ` +
      'done, and the limit was raised. Continue that work from where it stopped.',
  });
}

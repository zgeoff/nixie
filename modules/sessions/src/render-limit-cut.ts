import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// The task reads this only once a raise resumed it. A crash before the cut turn's commit leaves
// the model without that turn, so the message names no turn the model must find.
export function renderLimitCut(record: LogRecord, times: MessageTimeOptions): string {
  return renderSystemMessage({
    type: 'task-limit',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] Your dollar limit stopped a turn of yours before its work was ` +
      'done, and the limit was raised. Continue the work that is not done yet.',
  });
}

import type { LogRecord } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { formatSpendWait } from './format-spend-wait';

// The opening's lines for wait notices past the batch. Each carries no inbox ID, because the model
// reads the notice itself in a later batch, silently.
export function renderToldWaitNotices(
  records: readonly LogRecord[],
  times: MessageTimeOptions,
): string | null {
  if (records.length === 0) {
    return null;
  }

  return records
    .map((record) =>
      renderSystemMessage({
        type: 'status',
        at: formatMessageTime(record.recordedAt, null, times),
        body: formatSpendWait(record),
      }),
    )
    .join('\n\n');
}

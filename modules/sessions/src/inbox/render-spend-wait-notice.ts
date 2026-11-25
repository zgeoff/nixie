import type { LogRecord } from '@heynixie/log';
import { spendWaitNoticeCodec } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { formatSpendWait } from './format-spend-wait';

export function renderSpendWaitNotice(record: LogRecord, times: MessageTimeOptions): string {
  return renderSystemMessage({
    type: 'status',
    at: formatMessageTime(record.recordedAt, null, times),
    body: `[${spendWaitNoticeCodec.decode(record.payload).shortID}] ${formatSpendWait(record)}`,
  });
}

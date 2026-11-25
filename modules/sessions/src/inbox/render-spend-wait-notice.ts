import type { LogRecord } from '@heynixie/log';
import { spendWaitNoticeCodec } from '@heynixie/log';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';
import { formatSpendWait } from './format-spend-wait';

// The notice's short ID doubles as its block ID, so every render of one notice is the same text.
// A known block ID is safe here: nixie writes the whole body, so no outside text can close it.
export function renderSpendWaitNotice(record: LogRecord, times: MessageTimeOptions): string {
  const shortID = spendWaitNoticeCodec.decode(record.payload).shortID;

  return renderSystemMessage(
    {
      type: 'status',
      at: formatMessageTime(record.recordedAt, null, times),
      body: `[${shortID}] ${formatSpendWait(record)}`,
    },
    shortID,
  );
}

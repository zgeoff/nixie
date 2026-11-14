import type { LogRecord } from '@heynixie/log';
import { recoveryNoticeCodec } from '@heynixie/tasks';
import { renderSystemMessage } from '@heynixie/wire';
import { formatMessageTime } from '../message/format-message-time';
import type { MessageTimeOptions } from '../types';

export function renderRecoveryNotice(record: LogRecord, times: MessageTimeOptions): string {
  const notice = recoveryNoticeCodec.decode(record.payload);
  const restoredAt = formatMessageTime(new Date(notice.restoredAt), null, times);
  const backupTakenAt = formatMessageTime(new Date(notice.backupTakenAt), null, times);

  return renderSystemMessage({
    type: 'restore',
    at: formatMessageTime(record.recordedAt, null, times),
    body:
      `[#${record.sequence}] nixie was restored at ${restoredAt} from a backup taken at ` +
      `${backupTakenAt}. The log holds nothing after that time.`,
  });
}

import type { LogRecord } from '@heynixie/log';
import { findSessionLabel } from './find-session-label';
import { formatMessageWhen } from './format-message-when';
import type { MessageTimeOptions } from './types';

export function formatMessageStamp(record: LogRecord, times: MessageTimeOptions): string {
  const time = `#${record.sequence} · ${formatMessageWhen(record, times)}`;
  const label = findSessionLabel(record);

  return label === null ? time : `${time} · ${label}`;
}

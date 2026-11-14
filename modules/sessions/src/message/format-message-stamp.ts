import type { LogRecord } from '@heynixie/log';
import type { MessageTimeOptions } from '../types';
import { findSessionLabel } from '../utils/find-session-label';
import { formatMessageWhen } from './format-message-when';

export function formatMessageStamp(record: LogRecord, times: MessageTimeOptions): string {
  const time = `#${record.sequence} · ${formatMessageWhen(record, times)}`;
  const label = findSessionLabel(record);

  return label === null ? time : `${time} · ${label}`;
}

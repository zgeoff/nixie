import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// Formats your message's event ID, when you sent it, then its device session's label, as in
// #48213 · Tue 14 Oct, 14:05, Sydney · phone, so the model can cite it and fit the reply to your
// screen. A message with no label, or one forgotten with its text, shows only the ID and the time.
export function formatMessageStamp(record: LogRecord, times: MessageTimeOptions): string {
  const time = `#${record.sequence} · ${formatMessageTime(record.recordedAt, record.payload['timeZone'], times)}`;
  const label =
    record.erasable.status === 'readable' ? record.erasable.fields['sessionLabel'] : null;

  return typeof label === 'string' && label.trim() !== ''
    ? `${time} · ${label.replaceAll(/\s+/gu, ' ').trim()}`
    : time;
}

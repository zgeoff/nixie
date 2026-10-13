import type { LogRecord } from '@heynixie/log';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

// Formats when you sent your message, then the label of the device session it came from, as in
// Tue 14 Oct, 14:05, Sydney · phone, so the reply can fit your screen. A message with no label, or
// one forgotten with its text, shows only the time.
export function formatMessageStamp(record: LogRecord, times: MessageTimeOptions): string {
  const time = formatMessageTime(record, times);
  const label =
    record.erasable.status === 'readable' ? record.erasable.fields['sessionLabel'] : null;

  return typeof label === 'string' && label.trim() !== ''
    ? `${time} · ${label.replaceAll(/\s+/gu, ' ').trim()}`
    : time;
}

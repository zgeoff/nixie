import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import { formatTypedTime } from './format-typed-time';
import type { MessageTimeOptions } from './types';

// Formats your message's event ID, when you sent it, then its device session's label, as in
// #48213 · Tue 14 Oct, 14:05, Sydney · phone, so the model can cite it and fit the reply to your
// screen. A message with no label, or one forgotten with its text, shows only the ID and the time.
export function formatMessageStamp(record: LogRecord, times: MessageTimeOptions): string {
  const payload = ownerMessageCodec.tryDecodePartial(record.payload);
  const zone = payload?.timeZone;
  const sent = formatMessageTime(record.recordedAt, zone, times);
  const typed = findLateTypedTime(record.recordedAt, payload?.writtenAt);

  const when =
    typed === null
      ? sent
      : `typed ${formatTypedTime(typed, record.recordedAt, zone, times)}, sent ${sent}`;

  const time = `#${record.sequence} · ${when}`;

  const label =
    record.erasable.status === 'readable' ? record.erasable.fields['sessionLabel'] : null;

  return typeof label === 'string' && label.trim() !== ''
    ? `${time} · ${label.replaceAll(/\s+/gu, ' ').trim()}`
    : time;
}

// A message that reached nixie over 2 minutes from when you typed it shows both times, as in
// typed 08:12, sent Wed 14 Oct, 18:36, Sydney, so the model knows it waited on the device.
const lateAfterMs = 2 * 60 * 1000;

function findLateTypedTime(recordedAt: Date, writtenAt: string | undefined): Date | null {
  const typed = writtenAt === undefined ? Number.NaN : Date.parse(writtenAt);

  return Number.isNaN(typed) || Math.abs(recordedAt.getTime() - typed) <= lateAfterMs
    ? null
    : new Date(typed);
}

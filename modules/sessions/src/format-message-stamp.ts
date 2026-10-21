import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import { formatTypedTime } from './format-typed-time';
import type { MessageTimeOptions } from './types';

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

const lateAfterMs = 2 * 60 * 1000;

function findLateTypedTime(recordedAt: Date, writtenAt: string | undefined): Date | null {
  const typed = writtenAt === undefined ? Number.NaN : Date.parse(writtenAt);

  // A typed time after the arrival comes from a device clock that runs fast, so it shows nothing.
  return Number.isNaN(typed) || recordedAt.getTime() - typed <= lateAfterMs
    ? null
    : new Date(typed);
}

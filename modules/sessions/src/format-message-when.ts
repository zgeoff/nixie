import type { LogRecord } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import { formatTypedTime } from './format-typed-time';
import type { MessageTimeOptions } from './types';

// The send time of your message, with the time you typed it when it reached nixie long after.
export function formatMessageWhen(record: LogRecord, times: MessageTimeOptions): string {
  const payload = ownerMessageCodec.tryDecodePartial(record.payload);
  const zone = payload?.timeZone;
  const sent = formatMessageTime(record.recordedAt, zone, times);
  const typed = findLateTypedTime(record.recordedAt, payload?.writtenAt);

  return typed === null
    ? sent
    : `typed ${formatTypedTime(typed, record.recordedAt, zone, times)}, sent ${sent}`;
}

const lateAfterMs = 2 * 60 * 1000;

function findLateTypedTime(recordedAt: Date, writtenAt: string | undefined): Date | null {
  const typed = writtenAt === undefined ? Number.NaN : Date.parse(writtenAt);

  // A typed time after the arrival comes from a device clock that runs fast, so it shows nothing.
  return Number.isNaN(typed) || recordedAt.getTime() - typed <= lateAfterMs
    ? null
    : new Date(typed);
}

import type { LogRecord } from '@heynixie/log';

// The label you set on the device session that sent the message, on one line.
export function findSessionLabel(record: LogRecord): string | null {
  const label =
    record.erasable.status === 'readable' ? record.erasable.fields['sessionLabel'] : null;

  return typeof label === 'string' && label.trim() !== ''
    ? label.replaceAll(/\s+/gu, ' ').trim()
    : null;
}

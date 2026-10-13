import { isTimeZone } from '@heynixie/contract';
import type { LogRecord } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MessageTimeOptions } from './types';

// Formats when your message was sent, in the zone it was sent from, as in Tue 14 Oct, 14:05,
// Sydney. A message that carries no zone, or one this runtime does not know, uses the default zone.
// The year shows only when it is not the current year in that zone.
export function formatMessageTime(record: LogRecord, options: MessageTimeOptions): string {
  const zone = pickZone(record.payload['timeZone'], options.defaultZone);
  const sent = readDateParts(record.recordedAt, zone);
  const year = sent.year === readDateParts(options.now, zone).year ? '' : ` ${sent.year}`;

  return `${sent.weekday} ${sent.day} ${sent.month}${year}, ${sent.hour}:${sent.minute}, ${formatZoneCity(zone)}`;
}

function pickZone(zone: unknown, defaultZone: string): string {
  return typeof zone === 'string' && isTimeZone(zone) ? zone : defaultZone;
}

type DatePart = 'weekday' | 'day' | 'month' | 'year' | 'hour' | 'minute';

function readDateParts(at: Date, zone: string): Readonly<Record<DatePart, string>> {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const getPart = (type: DatePart): string => {
    const value = parts.find((part) => part.type === type)?.value;

    // the format asks for every part, so Intl returns each one
    invariant(value, `the date has no ${type}`);
    return value;
  };

  return {
    weekday: getPart('weekday'),
    day: getPart('day'),
    month: getPart('month'),
    year: getPart('year'),
    hour: getPart('hour'),
    minute: getPart('minute'),
  };
}

// the zone's last segment, so Australia/Sydney reads Sydney and America/New_York reads New York
function formatZoneCity(zone: string): string {
  return (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ');
}

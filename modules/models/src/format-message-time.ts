import { isTimeZone } from '@heynixie/contract';
import invariant from 'tiny-invariant';
import type { MessageTimeOptions } from './types';

// Formats when a message was sent, in the zone given, as in Tue 14 Oct, 14:05, Sydney. A zone that
// is missing, or one this runtime does not know, gives way to the default zone. The year shows only
// when it is not the current year in that zone.
export function formatMessageTime(at: Date, zone: unknown, options: MessageTimeOptions): string {
  const shown = pickZone(zone, options.defaultZone);
  const sent = readDateParts(at, shown);
  const year = sent.year === readDateParts(options.now, shown).year ? '' : ` ${sent.year}`;

  return `${sent.weekday} ${sent.day} ${sent.month}${year}, ${sent.hour}:${sent.minute}, ${formatZoneCity(shown)}`;
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
    invariant(value !== undefined, `the date has no ${type}`);

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

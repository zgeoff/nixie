import { match } from 'ts-pattern';
import type { TimePart } from './types';

// The library reads a zone's wall time by parsing text in the host's own zone, so a gap of the
// host's daylight saving moves the hour. This reads the part from the zone alone. The numbering
// follows the library's: Sunday is 0, the day starts at 1 and January is 0.
export function getZonedPart(instant: Date, zone: string, part: TimePart): bigint {
  const fields = Object.fromEntries(
    pickFormat(zone)
      .formatToParts(instant)
      .map((field) => [field.type, field.value]),
  );

  const year = Number(fields['year']);
  const month = Number(fields['month']);
  const day = Number(fields['day']);

  return match(part)
    .with('hour', () => BigInt(Number(fields['hour'])))
    .with('minute', () => BigInt(Number(fields['minute'])))
    .with('weekday', () => BigInt(new Date(Date.UTC(year, month - 1, day)).getUTCDay()))
    .with('day', () => BigInt(day))
    .with('month', () => BigInt(month - 1))
    .with('year', () => BigInt(year))
    .exhaustive();
}

const formats = new Map<string, Intl.DateTimeFormat>();

function pickFormat(zone: string): Intl.DateTimeFormat {
  const held = formats.get(zone);

  if (held !== undefined) {
    return held;
  }

  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    calendar: 'gregory',
    numberingSystem: 'latn',
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  });

  formats.set(zone, format);

  return format;
}

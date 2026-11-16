import invariant from 'tiny-invariant';

type Part = 'weekday' | 'day' | 'month' | 'year' | 'hour' | 'minute' | 'second';

export interface LocalTime {
  readonly weekday: string;
  readonly day: string;
  readonly month: string;
  readonly year: string;
  readonly hour: string;
  readonly minute: string;
  readonly iso: string;
}

// The instant as a person in the zone reads it, with the zone's offset at that instant.
export function buildLocalTime(at: Date, zone: string): LocalTime {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: zone,
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);

  const getPart = (type: Part): string => {
    const value = parts.find((part) => part.type === type)?.value;

    invariant(value !== undefined, `the date has no ${type}`);

    return value;
  };

  const monthName = new Intl.DateTimeFormat('en-US', { timeZone: zone, month: 'short' }).format(at);

  return {
    weekday: getPart('weekday'),
    day: String(Number(getPart('day'))),
    month: monthName,
    year: getPart('year'),
    hour: getPart('hour'),
    minute: getPart('minute'),
    iso:
      `${getPart('year')}-${getPart('month')}-${getPart('day')}T` +
      `${getPart('hour')}:${getPart('minute')}:${getPart('second')}${getOffset(at, zone)}`,
  };
}

function getOffset(at: Date, zone: string): string {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' })
    .formatToParts(at)
    .find((part) => part.type === 'timeZoneName')?.value;

  invariant(name !== undefined, 'the zone has no offset');

  return name === 'GMT' ? '+00:00' : name.replace('GMT', '');
}

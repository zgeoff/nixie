import invariant from 'tiny-invariant';

export type DatePart = 'weekday' | 'day' | 'month' | 'year' | 'hour' | 'minute';

export function splitDateParts(at: Date, zone: string): Readonly<Record<DatePart, string>> {
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

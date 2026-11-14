import invariant from 'tiny-invariant';

export function formatZonedTime(at: number, zone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZoneName: 'longOffset',
  }).formatToParts(at);

  const getPart = (type: Intl.DateTimeFormatPartTypes): string => {
    const value = parts.find((part) => part.type === type)?.value;

    invariant(value !== undefined, `the time has no ${type}`);

    return value;
  };

  const offset = getPart('timeZoneName').replace(/^GMT/u, '');

  return `${getPart('weekday')} ${getPart('day')} ${getPart('month')} ${getPart('year')}, ${getPart('hour')}:${getPart('minute')}, ${zone} (UTC${offset === '' ? '+00:00' : offset})`;
}

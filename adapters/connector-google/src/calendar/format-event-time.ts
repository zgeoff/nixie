import { datePattern } from './constants';

// An event time for a card: the weekday, the day, the month, the year and the time, in the zone of
// the time tool, with the zone's city, such as `Wed 18 Nov 2026, 14:00 Sydney`. An all-day event
// shows its date and `all day`. Text that is no time shows as it is.
export function formatEventTime(value: string, zone: string): string {
  if (datePattern.test(value)) {
    const day = new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: 'UTC',
    });

    return `${day.replaceAll(',', '')} (all day)`;
  }

  const timeMs = Date.parse(value);

  if (Number.isNaN(timeMs)) {
    return value;
  }

  const date = new Date(timeMs);

  const day = date
    .toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      timeZone: zone,
    })
    .replaceAll(',', '');

  const clock = date.toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: zone,
  });

  const city = (zone.split('/').pop() ?? zone).replaceAll('_', ' ');

  return `${day}, ${clock} ${city}`;
}

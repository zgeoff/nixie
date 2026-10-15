// Formats when an event happened as the owner reads a time, such as "Tue 14 Oct, 09:12, Sydney":
// the weekday, the day, the month, the 24-hour time, and the time zone's city.
export function formatEventTime(at: number, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';

  return `${getPart('weekday')} ${getPart('day')} ${getPart('month')}, ${getPart('hour')}:${getPart('minute')}, ${formatZoneCity(timeZone)}`;
}

// the last part of the zone's name, such as "New York" for America/New_York, or the name itself
// for a zone with no city, such as UTC
function formatZoneCity(timeZone: string): string {
  return (timeZone.split('/').at(-1) ?? timeZone).replaceAll('_', ' ');
}

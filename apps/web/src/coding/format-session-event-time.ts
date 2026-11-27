const timeFormat: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  month: 'short',
  second: '2-digit',
};

export function formatSessionEventTime(lastEventAt: Date | null): string {
  return lastEventAt === null
    ? 'No event yet'
    : `Last event ${lastEventAt.toLocaleString(undefined, timeFormat)}`;
}

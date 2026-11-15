// The time on the wall clock of the owner's zone, with the zone's city: 00:00 Sydney.
export function formatMandateTime(at: number, zone: string): string {
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: zone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date(at));

  const city = zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone;

  return `${time} ${city}`;
}

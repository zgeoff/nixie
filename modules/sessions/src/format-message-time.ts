import { pickMessageZone } from './pick-message-zone';
import { splitDateParts } from './split-date-parts';
import type { MessageTimeOptions } from './types';

// Formats when a message was sent, in the zone given, as in Tue 14 Oct, 14:05, Sydney. A zone that
// is missing, or one this runtime does not know, gives way to the default zone. The year shows only
// when it is not the current year in that zone.
export function formatMessageTime(at: Date, zone: unknown, options: MessageTimeOptions): string {
  const shown = pickMessageZone(zone, options.defaultZone);
  const sent = splitDateParts(at, shown);
  const year = sent.year === splitDateParts(options.now, shown).year ? '' : ` ${sent.year}`;

  return `${sent.weekday} ${sent.day} ${sent.month}${year}, ${sent.hour}:${sent.minute}, ${formatZoneCity(shown)}`;
}

// the zone's last segment, so Australia/Sydney reads Sydney and America/New_York reads New York
function formatZoneCity(zone: string): string {
  return (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ');
}

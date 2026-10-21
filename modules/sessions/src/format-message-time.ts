import { pickMessageZone } from './pick-message-zone';
import { splitDateParts } from './split-date-parts';
import type { MessageTimeOptions } from './types';

export function formatMessageTime(at: Date, zone: unknown, options: MessageTimeOptions): string {
  const shown = pickMessageZone(zone, options.defaultZone);
  const sent = splitDateParts(at, shown);
  const year = sent.year === splitDateParts(options.now, shown).year ? '' : ` ${sent.year}`;

  return `${sent.weekday} ${sent.day} ${sent.month}${year}, ${sent.hour}:${sent.minute}, ${formatZoneCity(shown)}`;
}

function formatZoneCity(zone: string): string {
  return (zone.split('/').at(-1) ?? zone).replaceAll('_', ' ');
}

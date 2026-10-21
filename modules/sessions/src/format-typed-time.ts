import { pickMessageZone } from './pick-message-zone';
import { splitDateParts } from './split-date-parts';
import type { MessageTimeOptions } from './types';

export function formatTypedTime(
  typed: Date,
  sent: Date,
  zone: unknown,
  options: MessageTimeOptions,
): string {
  const shown = pickMessageZone(zone, options.defaultZone);
  const typedParts = splitDateParts(typed, shown);
  const sentParts = splitDateParts(sent, shown);
  const time = `${typedParts.hour}:${typedParts.minute}`;

  const isSameDay =
    typedParts.year === sentParts.year &&
    typedParts.month === sentParts.month &&
    typedParts.day === sentParts.day;

  if (isSameDay) {
    return time;
  }

  const year =
    typedParts.year === splitDateParts(options.now, shown).year ? '' : ` ${typedParts.year}`;

  return `${typedParts.weekday} ${typedParts.day} ${typedParts.month}${year}, ${time}`;
}

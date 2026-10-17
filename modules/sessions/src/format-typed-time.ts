import { pickMessageZone } from './pick-message-zone';
import { splitDateParts } from './split-date-parts';
import type { MessageTimeOptions } from './types';

// Formats when you typed a message that was sent later, in the zone its send time shows in. A
// message typed on the day it was sent shows only the time, as in 08:12; one typed on an earlier day
// shows the day too, as in Tue 13 Oct, 22:40, with the year only when it is not the current year.
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

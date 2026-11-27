import { buildItemID } from '../gmail/build-item-id';
import { primaryCalendar } from './constants';

// The ID that a Calendar tool returns for an event: an event of `primary` carries no calendar.
export function buildEventRef(connection: string, event: string, calendar: string): string {
  const id = calendar === primaryCalendar ? event : `${event}@${calendar}`;

  return buildItemID(connection, id);
}

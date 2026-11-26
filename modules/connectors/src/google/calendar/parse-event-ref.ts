import { parseItemID } from '../gmail/parse-item-id';
import { primaryCalendar } from './constants';
import type { EventRef } from './types';

// Splits an event ID at its connection prefix and at the first `@`. Null for text that is none.
export function parseEventRef(text: string): EventRef | null {
  const item = parseItemID(text);

  if (item === null) {
    return null;
  }

  const at = item.id.indexOf('@');
  const event = at === -1 ? item.id : item.id.slice(0, at);
  const calendar = at === -1 ? primaryCalendar : item.id.slice(at + 1);

  return event === '' || calendar === '' ? null : { connection: item.connection, event, calendar };
}

import type { FakeCalendar, StoredEvent } from './types';

// Puts the event in the calendar's map, under its ID.
export function writeFakeEvent(
  calendar: FakeCalendar,
  calendarID: string,
  event: StoredEvent,
): void {
  const events = calendar.events.get(calendarID) ?? new Map<string, StoredEvent>();

  calendar.events.set(calendarID, events);
  events.set(String(event['id']), event);
}

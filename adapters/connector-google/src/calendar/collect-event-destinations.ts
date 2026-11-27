import type { CalendarEvent } from './types';

// The addresses that Google emails when a with-guests tool changes or cancels the event: each guest
// before the change, and each guest it adds. A guest that the change removes still gets an email.
export function collectEventDestinations(
  event: CalendarEvent,
  addGuests: readonly string[],
): string[] {
  return [...new Set([...event.guests.map((guest) => guest.address), ...addGuests])];
}

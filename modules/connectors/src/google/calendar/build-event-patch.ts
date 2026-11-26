import type { z } from 'zod';
import type { ActionMarker } from '../build-action-marker';
import { buildEventTime } from './build-event-time';
import type { calendarArgumentsSchema } from './calendar-arguments-schema';
import type { CalendarEvent } from './types';

interface PatchFacts {
  readonly marker: ActionMarker;

  // the markers of older actions that this write deletes
  readonly staleKeys: readonly string[];
}

// The body of an events.patch for a change: each field the call gives, the guests it adds and
// removes, and the action's marker with the deletion of the stale ones. Google takes an attendee list
// whole, so the list goes back with every attendee that stays.
export function buildEventPatch(
  event: CalendarEvent,
  args: z.output<typeof calendarArgumentsSchema.change>,
  facts: PatchFacts,
): Record<string, unknown> {
  const removeGuests = args.removeGuests ?? [];

  const removed = new Set(removeGuests);

  const added = args.addGuests ?? [];
  const isGuestChange = removed.size > 0 || added.length > 0;

  const known = new Set(event.attendees.map((attendee) => attendee.email.toLowerCase()));

  const attendees = [
    ...event.attendees.filter((attendee) => !removed.has(attendee.email.toLowerCase())),
    ...added.filter((address) => !known.has(address)).map((email) => ({ email })),
  ].map((attendee) =>
    Object.fromEntries(Object.entries(attendee).filter(([key]) => key !== 'self')),
  );

  const start = args.start === undefined || args.start === null ? null : buildEventTime(args.start);
  const end = args.end === undefined || args.end === null ? null : buildEventTime(args.end);

  return {
    ...pickField('summary', args.title),
    ...pickField('location', args.location),
    ...pickField('description', args.description),
    ...pickField('start', start),
    ...pickField('end', end),
    ...(isGuestChange ? { attendees } : {}),
    extendedProperties: {
      private: {
        [facts.marker.key]: facts.marker.value,
        ...Object.fromEntries(facts.staleKeys.map((key) => [key, null])),
      },
    },
  };
}

// A field of the patch when the call gives a value for it; none for null or absent.
function pickField(name: string, value: unknown): Record<string, unknown> {
  return value === undefined || value === null ? {} : { [name]: value };
}

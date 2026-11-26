import type { z } from 'zod';
import type { ActionMarker } from '../build-action-marker';
import { buildEventTime } from './build-event-time';
import type { calendarArgumentsSchema } from './calendar-arguments-schema';

interface InsertFacts {
  // the event's ID: the action ID without its hyphens, which fits Google's base32hex event IDs
  readonly id: string;
  readonly marker: ActionMarker;
}

// The body of an events.insert: the event's ID, its fields and the action's marker. `guests` is
// absent for a tool without guests.
export function buildEventInsert(
  args: Omit<z.output<typeof calendarArgumentsSchema.createWithGuests>, 'guests'> & {
    readonly guests?: readonly string[];
  },
  facts: InsertFacts,
): Record<string, unknown> {
  return {
    id: facts.id,
    summary: args.title,
    start: buildEventTime(args.start),
    end: buildEventTime(args.end),
    ...(args.location === undefined ? {} : { location: args.location }),
    ...(args.description === undefined ? {} : { description: args.description }),
    ...(args.guests === undefined ? {} : { attendees: args.guests.map((email) => ({ email })) }),
    extendedProperties: { private: { [facts.marker.key]: facts.marker.value } },
  };
}

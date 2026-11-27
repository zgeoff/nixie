import type { JSONObject } from '@heynixie/log';
import { fenceOutsideText } from '../gmail/fence-outside-text';
import { buildEventRef } from './build-event-ref';
import { toEndorsedTime } from './to-endorsed-time';
import type { CalendarEvent } from './types';

interface EventRendering {
  // what the model reads: every value of someone else's words sealed as outside content
  readonly result: JSONObject;

  // what the call's record keeps: the same fields as plain text, which a forget of the record erases
  readonly record: JSONObject;
}

// An event as a tool returns it. Its times, status and response are re-emitted from fixed shapes, so
// they cannot carry words. A cancelled event, and an event with no title, still read.
export function renderCalendarEvent(
  connection: string,
  event: CalendarEvent,
  description: string | null,
): EventRendering {
  const shared = {
    event: buildEventRef(connection, event.id, event.calendar),
    start: toEndorsedTime(event.start),
    end: toEndorsedTime(event.end),
    isAllDay: event.isAllDay,
    yourResponse: event.yourResponse,
    status: event.status,
  };

  const plain = {
    title: event.title,
    location: event.location === '' ? null : event.location,
    organizer: event.organizer,
    guests: event.guests.map((guest) => guest.address),
    ...(description === null ? {} : { description }),
  };

  return {
    result: {
      ...shared,
      title: fenceOutsideText(plain.title),
      location: plain.location === null ? null : fenceOutsideText(plain.location),
      organizer: plain.organizer === null ? null : fenceOutsideText(plain.organizer),
      guests: plain.guests.map((address) => fenceOutsideText(address)),
      ...(description === null ? {} : { description: fenceOutsideText(description) }),
    },
    record: { ...shared, ...plain },
  };
}

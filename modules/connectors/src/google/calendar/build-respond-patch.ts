import type { CalendarEvent, EventAttendee } from './types';

interface RespondFacts {
  readonly account: string;
  readonly response: string;
}

// The body of the events.patch for a response: the attendee list with the account's own entry set to
// the response, every other entry as Google holds it. When Google left attendees out, the patch
// carries the account's own entry alone and says so, because a patch replaces the array.
export function buildRespondPatch(
  event: CalendarEvent,
  facts: RespondFacts,
): Record<string, unknown> {
  const own = event.attendees.filter((attendee) => isOwn(attendee, facts.account));

  if (event.attendeesOmitted) {
    return {
      attendees: own.map((attendee) => buildAnswered(attendee, facts)),
      attendeesOmitted: true,
    };
  }

  return {
    attendees: event.attendees.map((attendee) =>
      isOwn(attendee, facts.account) ? buildAnswered(attendee, facts) : attendee,
    ),
  };
}

function isOwn(attendee: EventAttendee, account: string): boolean {
  return attendee.self === true || attendee.email.toLowerCase() === account.toLowerCase();
}

function buildAnswered(attendee: EventAttendee, facts: RespondFacts): Record<string, unknown> {
  const { self, ...rest } = attendee;

  return { ...rest, responseStatus: facts.response };
}

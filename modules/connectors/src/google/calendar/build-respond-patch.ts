import type { CalendarEvent } from './types';

interface RespondFacts {
  readonly account: string;
  readonly response: string;
}

// The body of the events.patch for a response: the attendee list with the account's own entry set to
// the response, every other entry as Google holds it.
export function buildRespondPatch(
  event: CalendarEvent,
  facts: RespondFacts,
): Record<string, unknown> {
  return {
    attendees: event.attendees.map((attendee) => {
      const { self, ...rest } = attendee;
      const isOwn = self === true || attendee.email.toLowerCase() === facts.account.toLowerCase();

      return isOwn ? { ...rest, responseStatus: facts.response } : rest;
    }),
  };
}

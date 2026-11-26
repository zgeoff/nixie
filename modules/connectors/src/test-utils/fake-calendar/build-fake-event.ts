import type { FakeEventSeed, StoredEvent } from './types';

interface FakeEventFacts {
  readonly account: string;
  readonly id: string;
  readonly etag: string;
}

// An event as the fake stores a seeded one. An event of another organizer lists the account as an
// invited attendee, and an event of the account with guests lists the account as its organizer.
export function buildFakeEvent(seed: FakeEventSeed, facts: FakeEventFacts): StoredEvent {
  const account = facts.account;
  const organizer = seed.organizer ?? account;
  const isOrganizer = organizer === account;
  const guests = seed.guests ?? [];

  const own = isOrganizer
    ? [{ email: account, self: true, organizer: true, responseStatus: 'accepted' }]
    : [
        { email: organizer, organizer: true, responseStatus: 'accepted' },
        { email: account, self: true, responseStatus: seed.yourResponse ?? 'needsAction' },
      ];

  const others = guests.map((guest) => ({
    email: guest.email,
    responseStatus: guest.response ?? 'needsAction',
  }));

  const hasAttendees = guests.length > 0 || !isOrganizer;
  const properties = seed.privateProperties;

  return {
    id: facts.id,
    etag: facts.etag,
    status: 'confirmed',
    summary: seed.title,
    ...(seed.location === undefined ? {} : { location: seed.location }),
    ...(seed.description === undefined ? {} : { description: seed.description }),
    htmlLink: `https://www.google.com/calendar/event?eid=${facts.id}`,
    start: toTime(seed.start),
    end: toTime(seed.end),
    organizer: isOrganizer ? { email: account, self: true } : { email: organizer },
    ...(hasAttendees ? { attendees: [...own, ...others] } : {}),
    ...(properties === undefined ? {} : { extendedProperties: { private: { ...properties } } }),
  };
}

function toTime(value: string): { date: string } | { dateTime: string } {
  return /^\d{4}-\d{2}-\d{2}$/u.test(value) ? { date: value } : { dateTime: value };
}

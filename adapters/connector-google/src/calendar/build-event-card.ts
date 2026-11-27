import type { GmailCard } from '../gmail/gmail-card';
import { joinCardList } from '../gmail/gmail-card';
import type { CalendarEvent } from './types';

// What a change adds to a card besides the event: the new value of each field the call gives, and
// the guests it adds and removes, or the response of a respond. Absent keys stay out of the card.
export interface EventCardChange {
  readonly titleAfter?: string;
  readonly startAfter?: string;
  readonly endAfter?: string;
  readonly locationAfter?: string;
  readonly descriptionAfter?: string;
  readonly addGuests?: readonly string[];
  readonly removeGuests?: readonly string[];
  readonly response?: string;
}

// The facts of an event call that only Google knows, which `prepare` reads before the decision and
// the approval card shows. The call's record seals them as an attachment, so a forget of the record
// erases them.
export function buildEventCard(event: CalendarEvent, change: EventCardChange): GmailCard {
  const entries: readonly (readonly [string, string | undefined])[] = [
    ['title', event.title],
    ['start', event.start],
    ['end', event.end],
    ['calendar', event.calendar],
    ['location', event.location],
    ['description', event.description],
    ['guests', joinCardList(event.guests.map((guest) => guest.address))],
    ['organizer', event.organizer ?? ''],
    ['titleAfter', change.titleAfter],
    ['startAfter', change.startAfter],
    ['endAfter', change.endAfter],
    ['locationAfter', change.locationAfter],
    ['descriptionAfter', change.descriptionAfter],
    ['addGuests', joinCardList(change.addGuests ?? [])],
    ['removeGuests', joinCardList(change.removeGuests ?? [])],
    ['response', change.response],
  ];

  return Object.fromEntries(
    entries.filter((entry): entry is [string, string] => entry[1] !== undefined),
  );
}

// The `start` or `end` of an event as Google takes it: a date for an all-day event, a date-time
// with an offset for any other.
export type EventTimeField = { readonly date: string } | { readonly dateTime: string };

export type EventStatus = 'confirmed' | 'tentative' | 'cancelled';

export type EventResponse = 'accepted' | 'declined' | 'tentative' | 'needsAction';

export interface EventAttendee {
  readonly email: string;
  readonly responseStatus?: string;
  readonly resource?: boolean;
  readonly optional?: boolean;
  readonly organizer?: boolean;
  readonly displayName?: string;
  readonly self?: boolean;
  readonly id?: string;

  // the guest's note with the response, and the people the guest brings
  readonly comment?: string;
  readonly additionalGuests?: number;
}

export interface EventGuest {
  // a bare address in lowercase NFC
  readonly address: string;
  readonly response: EventResponse | null;
}

// An event as Google holds it, with the fields the Calendar tools read.
export interface CalendarEvent {
  readonly id: string;

  // the calendar the event was read from: `primary` or a calendar ID
  readonly calendar: string;
  readonly etag: string;
  readonly status: EventStatus;
  readonly title: string;
  readonly location: string;
  readonly description: string;

  // RFC 3339 with an offset, or a date for an all-day event; empty when Google gave none
  readonly start: string;
  readonly end: string;
  readonly isAllDay: boolean;
  readonly link: string | null;

  // the organizer's address in lowercase NFC; null when Google names none
  readonly organizer: string | null;
  readonly isOrganizedByAccount: boolean;

  // every attendee except the connection's own account
  readonly guests: readonly EventGuest[];

  // the account's own response; null when the account is no attendee
  readonly yourResponse: EventResponse | null;

  // every attendee as Google holds it, the account's own entry included, for a write that sends the
  // list back whole
  readonly attendees: readonly EventAttendee[];

  // the private properties, which hold nixie's markers
  readonly privateProperties: Readonly<Record<string, string>>;
}

// An event ID that the model passes back: the connection, a dot, Google's event ID, and for an
// event of a calendar other than `primary`, a second `@` and the calendar's ID.
export interface EventRef {
  readonly connection: string;
  readonly event: string;
  readonly calendar: string;
}

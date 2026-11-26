import type { FakeHold } from '../fake-gmail/build-fake-hold';
import type { FakeFailure } from '../fake-gmail/create-fake-gmail';

export interface FakeEventSeed {
  // `primary` when absent
  readonly calendar?: string;
  readonly id?: string;
  readonly title: string;

  // RFC 3339 with an offset, or a date for an all-day event
  readonly start: string;
  readonly end: string;
  readonly location?: string;
  readonly description?: string;

  // who organizes the event; the account when absent
  readonly organizer?: string;

  // the other attendees; the account's own entry is added
  readonly guests?: readonly { readonly email: string; readonly response?: string }[];

  // the account's own response when it is invited
  readonly yourResponse?: string;
  readonly privateProperties?: Readonly<Record<string, string>>;
}

export interface FakeWrite {
  readonly method: string;
  readonly calendar: string;
  readonly id: string;

  // the `sendUpdates` the call asked for; empty when it asked for none
  readonly sendUpdates: string;
}

export type StoredEvent = Record<string, unknown>;

export interface FakeCalendar {
  readonly account: string;

  // the events of each calendar by ID, under the calendar's own ID
  readonly events: Map<string, Map<string, StoredEvent>>;
  readonly calendars: { id: string; summary: string; primary?: boolean; accessRole: string }[];

  // each request as `GET /calendar/v3/calendars/primary/events?...`, in order
  readonly requests: string[];

  // each event write, in order
  readonly writes: FakeWrite[];
  readonly failures: FakeFailure[];

  // stops the next request whose line starts with `line` before it answers
  readonly hold: (line: string) => FakeHold;
  readonly holds: FakeHold[];
  readonly seed: (event: FakeEventSeed) => { readonly id: string };
  readonly serve: (request: Request) => Promise<Response | null>;
}

export interface FakeCalendarState {
  counter: number;
  version: number;
}

export interface FakeCalendarCall {
  readonly request: Request;
  readonly url: URL;
}

// A call to one calendar.
export interface FakeCalendarFacts {
  readonly calendarID: string;
  readonly call: FakeCalendarCall;
}

// A call to one stored event.
export interface FakeEventFacts extends FakeCalendarFacts {
  readonly stored: StoredEvent;
}

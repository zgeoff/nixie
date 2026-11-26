import type { FakeCalendar, FakeCalendarCall } from './types';

interface FakeWriteFacts {
  readonly method: string;
  readonly calendar: string;
  readonly id: string;
  readonly call: FakeCalendarCall;
}

// Keeps a write for a test to read, with the `sendUpdates` it asked for.
export function recordFakeWrite(calendar: FakeCalendar, facts: FakeWriteFacts): void {
  calendar.writes.push({
    method: facts.method,
    calendar: facts.calendar,
    id: facts.id,
    sendUpdates: facts.call.url.searchParams.get('sendUpdates') ?? '',
  });
}

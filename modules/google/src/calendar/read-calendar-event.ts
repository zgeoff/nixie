import type { ConnectorContext } from '@heynixie/connections';
import { callGoogle } from '../call/call-google';
import type { GoogleHosts } from '../types';
import { buildEventPath } from './build-event-path';
import { primaryCalendar } from './constants';
import { normalizeAddress } from './normalize-address';
import { parseCalendarEvent } from './parse-calendar-event';
import { readCalendarOwnership } from './read-calendar-ownership';
import type { CalendarEvent } from './types';

export type CalendarEventRead =
  | { readonly kind: 'event'; readonly event: CalendarEvent }
  | { readonly kind: 'missing' }
  | { readonly kind: 'failed'; readonly reason: string; readonly retryAfterMs: number | null };

interface EventRequest {
  readonly calendar: string;
  readonly event: string;
}

// Reads one event live. A 404 or 410 is a value, and any other failure carries Google's reason. An
// event that was cancelled reads with the status `cancelled`. The organizer of an event on a calendar
// that the account owns is the calendar, so the read asks Google for the account's role there.
export async function readCalendarEvent(
  hosts: GoogleHosts,
  context: ConnectorContext,
  request: EventRequest,
): Promise<CalendarEventRead> {
  const reply = await callGoogle(hosts, context, {
    path: buildEventPath(request.calendar, request.event),
  });

  if (reply.kind === 'error') {
    return reply.status === 404 || reply.status === 410
      ? { kind: 'missing' }
      : { kind: 'failed', reason: reply.reason, retryAfterMs: reply.retryAfterMs };
  }

  const event = parseCalendarEvent(reply.body, {
    calendar: request.calendar,
    account: context.account,
  });

  if (event === null) {
    return { kind: 'failed', reason: 'Google answered with no event', retryAfterMs: null };
  }

  const isCalendarOrganizer =
    !event.isOrganizedByAccount &&
    event.isOrganizerSelf &&
    request.calendar !== primaryCalendar &&
    event.organizer === normalizeAddress(request.calendar);

  if (isCalendarOrganizer) {
    const isOwner = await readCalendarOwnership(hosts, context, request.calendar);

    return { kind: 'event', event: { ...event, isOrganizedByAccount: isOwner } };
  }

  return { kind: 'event', event };
}

import type { ConnectorContext } from '../../types';
import { callGoogle } from '../call-google';
import type { GoogleHosts } from '../google-hosts';
import { buildEventPath } from './build-event-path';
import { parseCalendarEvent } from './parse-calendar-event';
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
// event that was cancelled reads with the status `cancelled`.
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

  return event === null
    ? { kind: 'failed', reason: 'Google answered with no event', retryAfterMs: null }
    : { kind: 'event', event };
}

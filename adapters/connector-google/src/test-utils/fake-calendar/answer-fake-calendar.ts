import { fakeCalendarPrefix } from './constants';
import { insertFakeEvent } from './insert-fake-event';
import { listFakeEvents } from './list-fake-events';
import { patchFakeEvent } from './patch-fake-event';
import { presentFakeEvent } from './present-fake-event';
import { removeFakeEvent } from './remove-fake-event';
import type { FakeCalendar, FakeCalendarCall, FakeCalendarState } from './types';

// Routes one Calendar request to the fake: the calendar list, and the list, read, insert, patch and
// delete of events.
export function answerFakeCalendar(
  calendar: FakeCalendar,
  state: FakeCalendarState,
  call: FakeCalendarCall,
): Promise<Response> | Response {
  const segments = call.url.pathname
    .slice(fakeCalendarPrefix.length)
    .split('/')
    .filter((segment) => segment !== '')
    .map((segment) => decodeURIComponent(segment));

  if (segments[0] === 'users' && segments[2] === 'calendarList') {
    const offset = Number(call.url.searchParams.get('pageToken') ?? 0);

    const size = Math.min(
      calendar.listPageSize,
      Number(call.url.searchParams.get('maxResults') ?? 250),
    );

    const next = offset + size < calendar.calendars.length ? String(offset + size) : undefined;

    return Response.json({
      items: calendar.calendars.slice(offset, offset + size),
      ...(next === undefined ? {} : { nextPageToken: next }),
    });
  }

  const [kind, calendarID, events, eventID] = segments;

  if (kind !== 'calendars' || calendarID === undefined || events !== 'events') {
    return notFound();
  }

  const method = call.request.method;

  if (eventID === undefined) {
    return method === 'GET'
      ? listFakeEvents(calendar, calendarID, call.url)
      : insertFakeEvent(calendar, state, { calendarID, call });
  }

  const stored = calendar.events.get(calendarID)?.get(eventID);

  if (stored === undefined) {
    return notFound();
  }

  if (method === 'GET') {
    return Response.json(presentFakeEvent(stored));
  }

  return method === 'DELETE'
    ? removeFakeEvent(calendar, state, { calendarID, stored, call })
    : patchFakeEvent(calendar, state, { calendarID, stored, call });
}

function notFound(): Response {
  return new Response('{"error":{"errors":[{"reason":"notFound"}]}}', { status: 404 });
}

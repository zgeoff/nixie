import { buildFakeEtag } from './build-fake-etag';
import { fakeEventBodySchema } from './fake-event-body-schema';
import { recordFakeWrite } from './record-fake-write';
import type { FakeCalendar, FakeCalendarFacts, FakeCalendarState, StoredEvent } from './types';
import { writeFakeEvent } from './write-fake-event';

// The events.insert of a calendar: the event takes the ID the call gives, the account as its
// organizer and an attendee entry for each guest. An ID that exists answers 409, as Google does.
export async function insertFakeEvent(
  calendar: FakeCalendar,
  state: FakeCalendarState,
  facts: FakeCalendarFacts,
): Promise<Response> {
  const json: unknown = await facts.call.request.json();

  const parsed = fakeEventBodySchema.safeParse(json);

  if (!parsed.success || parsed.data.id === undefined) {
    return new Response('{"error":{"errors":[{"reason":"invalid"}]}}', { status: 400 });
  }

  const body = parsed.data;
  const id = parsed.data.id;

  if (calendar.events.get(facts.calendarID)?.has(id) === true) {
    return new Response('{"error":{"errors":[{"reason":"duplicate"}]}}', { status: 409 });
  }

  const organizer = {
    email: calendar.account,
    self: true,
    organizer: true,
    responseStatus: 'accepted',
  };

  const invited = (body.attendees ?? []).map((attendee) => ({
    email: attendee.email,
    responseStatus: 'needsAction',
  }));

  const event: StoredEvent = {
    ...body,
    id,
    etag: buildFakeEtag(state),
    status: 'confirmed',
    htmlLink: `https://www.google.com/calendar/event?eid=${id}`,
    organizer: { email: calendar.account, self: true },
    ...(body.attendees === undefined ? {} : { attendees: [organizer, ...invited] }),
  };

  writeFakeEvent(calendar, facts.calendarID, event);
  recordFakeWrite(calendar, { method: 'POST', calendar: facts.calendarID, id, call: facts.call });

  return Response.json(event);
}

import { buildFakeEtag } from './build-fake-etag';
import { fakeEventBodySchema } from './fake-event-body-schema';
import { parseFakePrivate } from './parse-fake-private';
import { pickStaleResponse } from './pick-stale-response';
import { recordFakeWrite } from './record-fake-write';
import type { FakeCalendar, FakeCalendarState, FakeEventFacts } from './types';

// The events.patch of one event: merges the fields the call gives, and its private properties, where
// a null deletes one. A stale `If-Match` answers 412 and changes nothing.
export async function patchFakeEvent(
  calendar: FakeCalendar,
  state: FakeCalendarState,
  facts: FakeEventFacts,
): Promise<Response> {
  const stale = pickStaleResponse(facts);

  if (stale !== null) {
    return stale;
  }

  const json: unknown = await facts.call.request.json();

  const parsed = fakeEventBodySchema.safeParse(json);

  if (!parsed.success) {
    return new Response('{"error":{"errors":[{"reason":"invalid"}]}}', { status: 400 });
  }

  const fields = Object.fromEntries(
    Object.entries(parsed.data).filter(([key]) => key !== 'extendedProperties'),
  );

  const properties = parseFakePrivate(facts.stored);

  for (const [key, value] of Object.entries(parsed.data.extendedProperties?.private ?? {})) {
    if (value === null) {
      Reflect.deleteProperty(properties, key);
    } else {
      properties[key] = value;
    }
  }

  Object.assign(facts.stored, fields, {
    etag: buildFakeEtag(state),
    extendedProperties: { private: properties },
  });

  recordFakeWrite(calendar, {
    method: 'PATCH',
    calendar: facts.calendarID,
    id: String(facts.stored['id']),
    call: facts.call,
  });

  return Response.json(facts.stored);
}

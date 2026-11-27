import { buildFakeEtag } from './build-fake-etag';
import { pickStaleResponse } from './pick-stale-response';
import { recordFakeWrite } from './record-fake-write';
import type { FakeCalendar, FakeCalendarState, FakeEventFacts } from './types';

// The events.delete of one event: it stays, with the status `cancelled`. A cancelled event answers
// 410, and a stale `If-Match` answers 412.
export function removeFakeEvent(
  calendar: FakeCalendar,
  state: FakeCalendarState,
  facts: FakeEventFacts,
): Response {
  if (facts.stored['status'] === 'cancelled') {
    return new Response('{"error":{"errors":[{"reason":"deleted"}]}}', { status: 410 });
  }

  const stale = pickStaleResponse(facts);

  if (stale !== null) {
    return stale;
  }

  Object.assign(facts.stored, { status: 'cancelled', etag: buildFakeEtag(state) });

  recordFakeWrite(calendar, {
    method: 'DELETE',
    calendar: facts.calendarID,
    id: String(facts.stored['id']),
    call: facts.call,
  });

  return new Response(null, { status: 204 });
}

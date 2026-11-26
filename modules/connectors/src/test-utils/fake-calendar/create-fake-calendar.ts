import { buildFakeHold } from '../fake-gmail/build-fake-hold';
import { answerFakeCalendar } from './answer-fake-calendar';
import { buildFakeEtag } from './build-fake-etag';
import { buildFakeEvent } from './build-fake-event';
import { fakeCalendarPrefix } from './constants';
import type { FakeCalendar } from './types';
import { writeFakeEvent } from './write-fake-event';

// An in-memory Google Calendar that answers the calls of the Calendar tools: the calendar list, and
// the list, read, insert, patch and delete of events. It refuses a stale `If-Match` with 412, an
// insert of an ID that exists with 409, and a delete of a cancelled event with 410.
export function createFakeCalendar(account = 'me@example.test'): FakeCalendar {
  const state = { counter: 0, version: 0 };

  const calendar: FakeCalendar = {
    account,
    events: new Map(),
    calendars: [{ id: account, summary: 'Personal', primary: true, accessRole: 'owner' }],
    listPageSize: 250,
    requests: [],
    writes: [],
    failures: [],
    holds: [],
    hold: (line) => {
      const hold = buildFakeHold(line);

      calendar.holds.push(hold);

      return hold;
    },
    seed: (seed) => {
      state.counter += 1;

      const id = seed.id ?? `seeded${String(state.counter).padStart(4, '0')}`;
      const event = buildFakeEvent(seed, { account, id, etag: buildFakeEtag(state) });

      writeFakeEvent(calendar, seed.calendar ?? 'primary', event);

      return { id };
    },
    serve: async (request) => {
      const url = new URL(request.url);

      if (!url.pathname.startsWith(fakeCalendarPrefix)) {
        return null;
      }

      const line = `${request.method} ${url.pathname}${url.search}`;

      calendar.requests.push(line);

      const held = calendar.holds.find((entry) => line.startsWith(entry.line));

      if (held !== undefined) {
        calendar.holds.splice(calendar.holds.indexOf(held), 1);

        await held.arrive();
      }

      const failure = calendar.failures.find((entry) => line.startsWith(entry.line));

      if (failure !== undefined) {
        calendar.failures.splice(calendar.failures.indexOf(failure), 1);

        const failed = new Response(
          failure.body ?? '{"error":{"errors":[{"reason":"backendError"}]}}',
          {
            status: failure.status,
            ...(failure.headers === undefined ? {} : { headers: failure.headers }),
          },
        );

        return failed;
      }

      return answerFakeCalendar(calendar, state, { request, url });
    },
  };

  return calendar;
}

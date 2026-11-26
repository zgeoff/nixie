import { expect, test } from 'bun:test';
import { pickEventRefusal } from './pick-event-refusal';
import type { CalendarEvent } from './types';

function setupTest() {
  return {
    buildEvent: (extra: Partial<CalendarEvent>): CalendarEvent => ({
      id: 'e1',
      calendar: 'primary',
      etag: '"1"',
      status: 'confirmed',
      title: 'Review',
      location: '',
      description: '',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
      isAllDay: false,
      link: null,
      organizer: 'me@example.test',
      isOrganizedByAccount: true,
      isOrganizerSelf: false,
      attendeesOmitted: false,
      guests: [],
      attendees: [],
      yourResponse: null,
      privateProperties: {},
      ...extra,
    }),
  };
}

test.each([
  {
    title: 'an event of another organizer',
    event: {
      isOrganizedByAccount: false,
      guests: [{ address: 'sam@example.org', response: null }],
    },
    facts: { withGuests: true },
    code: 'not_organizer',
  },
  {
    title: 'a cancelled event',
    event: { status: 'cancelled' as const },
    facts: { withGuests: false },
    code: 'cancelled',
  },
  {
    title: 'a guest in a tool without guests',
    event: { guests: [{ address: 'sam@example.org', response: null }] },
    facts: { withGuests: false },
    code: 'has_guests',
  },
  {
    title: 'no guest before or after in a tool with guests',
    event: {},
    facts: { withGuests: true },
    code: 'no_guests',
  },
])('#pickEventRefusal refuses $title', (row) => {
  const ctx = setupTest();

  const refusal = pickEventRefusal(ctx.buildEvent(row.event), {
    addGuests: [],
    removeGuests: [],
    ...row.facts,
  });

  expect(refusal?.code).toBe(row.code);
});

test.each([
  { title: 'no guest in a tool without guests', event: {}, facts: { withGuests: false } },
  {
    title: 'a guest in a tool with guests',
    event: { guests: [{ address: 'sam@example.org', response: null }] },
    facts: { withGuests: true },
  },
  {
    title: 'the only guest removed in a tool with guests, who still gets the email',
    event: { guests: [{ address: 'sam@example.org', response: null }] },
    facts: { withGuests: true, removeGuests: ['sam@example.org'] },
  },
  {
    title: 'no guest before and one added in a tool with guests',
    event: {},
    facts: { withGuests: true, addGuests: ['kim@example.org'] },
  },
])('#pickEventRefusal lets through $title', (row) => {
  const ctx = setupTest();

  const refusal = pickEventRefusal(ctx.buildEvent(row.event), {
    addGuests: [],
    removeGuests: [],
    ...row.facts,
  });

  expect(refusal).toBeNull();
});

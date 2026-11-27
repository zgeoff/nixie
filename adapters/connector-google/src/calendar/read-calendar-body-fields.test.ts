import { expect, test } from 'bun:test';
import { startTestLog } from '@heynixie/connectors/test-utils';
import { writeRecords } from '@heynixie/log';
import { buildCardAttachment } from '../gmail/gmail-card';
import { buildEventCard } from './build-event-card';
import { readCalendarBodyFields } from './read-calendar-body-fields';
import type { CalendarEvent } from './types';

async function setupTest() {
  const log = await startTestLog();

  // writes the call's own record with the card that `prepare` sealed, and returns its sequence
  const writeCall = async (card: ReturnType<typeof buildEventCard>): Promise<number> => {
    await writeRecords(log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: { timeZone: 'Australia/Sydney' },
      },
      {
        kind: 'tool_called',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {},
        attachments: [buildCardAttachment(card)],
      },
    ]);

    return 2;
  };

  const event: CalendarEvent = {
    id: 'e1',
    calendar: 'primary',
    etag: '"1"',
    status: 'confirmed',
    title: 'Q3 review',
    location: 'Room 4',
    description: '',
    start: '2026-11-18T14:00:00+11:00',
    end: '2026-11-18T14:30:00+11:00',
    isAllDay: false,
    link: null,
    organizer: 'me@example.test',
    isOrganizedByAccount: true,
    isOrganizerSelf: false,
    attendeesOmitted: false,
    guests: [
      { address: 'sam@example.org', response: null },
      { address: 'lee@example.org', response: null },
    ],
    attendees: [],
    yourResponse: null,
    privateProperties: {},
  };

  return {
    log,
    event,
    writeCall,
    read: (tool: string, input: Record<string, string | readonly string[]>, callSequence: number) =>
      readCalendarBodyFields(
        log,
        { tool, thread: 'conversation', input: { ...input }, callSequence },
        'UTC',
      ),
  };
}

test.each([
  {
    tool: 'calendar.create_event',
    input: {},
    sentence: 'Add "Q3 review" on Wed 18 Nov 2026, 03:00 UTC to primary',
    button: 'Add event',
  },
  {
    tool: 'calendar.create_event_with_guests',
    input: { guests: ['sam@example.org'] },
    sentence: 'Invite sam@example.org to "Q3 review" on Wed 18 Nov 2026, 03:00 UTC',
    button: 'Send invitations',
  },
])('it words the card of $tool from the call input, in the default zone', async (row) => {
  const ctx = await setupTest();

  const fields = await ctx.read(
    row.tool,
    {
      title: 'Q3 review',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
      ...row.input,
    },
    1,
  );

  expect(fields).toMatchObject({
    status: 'fields',
    sentence: row.sentence,
    approveLabel: row.button,
  });
});

test('it shows a create with guests with each guest and the times of the event, with no permission named before a decision', async () => {
  const ctx = await setupTest();

  const fields = await ctx.read(
    'calendar.create_event_with_guests',
    {
      title: 'Q3 review',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
      guests: ['sam@example.org'],
      location: 'Room 4',
    },
    1,
  );

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {
      title: 'Q3 review',
      start: 'Wed 18 Nov 2026, 03:00 UTC',
      end: 'Wed 18 Nov 2026, 03:30 UTC',
      calendar: 'primary',
      location: 'Room 4',
      guests: 'sam@example.org',
    },
    sentence: 'Invite sam@example.org to "Q3 review" on Wed 18 Nov 2026, 03:00 UTC',
    approveLabel: 'Send invitations',
  });
});

test('it words the change with guests with each field before and after, in the zone of the owner', async () => {
  const ctx = await setupTest();

  const sequence = await ctx.writeCall(
    buildEventCard(ctx.event, {
      titleAfter: 'Q3 planning',
      startAfter: '2026-11-18T15:00:00+11:00',
      endAfter: '2026-11-18T15:30:00+11:00',
      addGuests: ['kim@example.org'],
      removeGuests: ['lee@example.org'],
    }),
  );

  const fields = await ctx.read('calendar.change_event_with_guests', {}, sequence);

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {
      title: 'Q3 review',
      start: 'Wed 18 Nov 2026, 14:00 Sydney',
      end: 'Wed 18 Nov 2026, 14:30 Sydney',
      calendar: 'primary',
      location: 'Room 4',
      guests: 'sam@example.org, lee@example.org, kim@example.org',
      organizer: 'me@example.test',
      titleChange: 'Q3 review -> Q3 planning',
      startChange: 'Wed 18 Nov 2026, 14:00 Sydney -> Wed 18 Nov 2026, 15:00 Sydney',
      endChange: 'Wed 18 Nov 2026, 14:30 Sydney -> Wed 18 Nov 2026, 15:30 Sydney',
      removedGuests: 'lee@example.org',
    },
    sentence:
      'Change "Q3 review" on Wed 18 Nov 2026, 14:00 Sydney and email sam@example.org, lee@example.org, kim@example.org',
    approveLabel: 'Send changes',
  });
});

test.each([
  {
    tool: 'calendar.change_event',
    change: { titleAfter: 'Renamed' },
    sentence: 'Change "Q3 review" on Wed 18 Nov 2026, 14:00 Sydney',
    button: 'Change event',
  },
  {
    tool: 'calendar.cancel_event',
    change: {},
    sentence: 'Cancel "Q3 review" on Wed 18 Nov 2026, 14:00 Sydney',
    button: 'Cancel event',
  },
  {
    tool: 'calendar.cancel_event_with_guests',
    change: {},
    sentence:
      'Cancel "Q3 review" on Wed 18 Nov 2026, 14:00 Sydney and email sam@example.org, lee@example.org',
    button: 'Cancel and email',
  },
  {
    tool: 'calendar.respond',
    change: { response: 'tentative' },
    sentence:
      'Tell me@example.test you tentatively accepted "Q3 review" on Wed 18 Nov 2026, 14:00 Sydney',
    button: 'Send response',
  },
])('it words the card of $tool from the facts that prepare read', async (row) => {
  const ctx = await setupTest();
  const sequence = await ctx.writeCall(buildEventCard(ctx.event, row.change));
  const fields = await ctx.read(row.tool, {}, sequence);

  expect(fields).toMatchObject({
    status: 'fields',
    sentence: row.sentence,
    approveLabel: row.button,
  });
});

test('it leaves the card of a change without a body when its facts are gone', async () => {
  const ctx = await setupTest();
  const fields = await ctx.read('calendar.change_event', {}, 99);

  expect(fields).toStrictEqual({ status: 'unreadable' });
});

test('it adds no field to a call of another tool', async () => {
  const ctx = await setupTest();
  const fields = await ctx.read('calendar.list_events', {}, 1);

  expect(fields).toStrictEqual({ status: 'none' });
});

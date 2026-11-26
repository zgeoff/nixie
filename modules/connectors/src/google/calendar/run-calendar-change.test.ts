import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { parseFakePrivate } from '../../test-utils/fake-calendar/parse-fake-private';
import { startGmailTools } from '../../test-utils/start-gmail-tools';
import { parseCardAttachment } from '../gmail/gmail-card';

async function setupTest() {
  const ctx = await startGmailTools();

  const prepare = (tool: string, args: Record<string, unknown>) =>
    ctx
      .findAction(tool)
      .tool.prepare?.({ connection: 'k3x9m2p7qa', ...args }, { run: ctx.buildContext().run });

  const attempt = (tool: string, args: Record<string, unknown>, destinations: string[] = []) => {
    const queued = ctx.findAction(tool).queued;

    invariant(queued, `${tool} runs queued`);

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool,
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations,
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  const createEvent = (extra: Partial<Parameters<typeof ctx.site.calendar.seed>[0]> = {}) =>
    ctx.site.calendar.seed({
      title: 'Q3 review',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
      ...extra,
    });

  return { ...ctx, prepare, attempt, createEvent };
}

test('it deletes no newer marker and writes none of its own when its action is older than 10 stored markers', async () => {
  const ctx = await setupTest();

  const newer = Object.fromEntries(
    Array.from({ length: 10 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(9_000_000_000 + index),
    ]),
  );

  const seeded = ctx.createEvent({ privateProperties: newer });

  await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect(stored?.['extendedProperties']).toStrictEqual({ private: newer });
});

test('it refuses a change of an event that another account organizes although Google marks the organizer as self', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    organizer: 'boss@example.org',
    isOrganizerSelf: true,
    guests: [{ email: 'sam@example.org' }],
  });

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  const response = await ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, title: 'Renamed' },
    ['boss@example.org', 'sam@example.org'],
  );

  expect([prepared, response.kind, ctx.site.calendar.writes]).toStrictEqual([
    { status: 'error', message: expect.stringContaining('NOT_ORGANIZER') },
    'refused',
    [],
  ]);
});

test('it changes an event on a secondary calendar that the account owns, where the organizer is the calendar', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.calendars.push({
    id: 'team@group.calendar.google.com',
    summary: 'Team',
    accessRole: 'owner',
  });

  const seeded = ctx.createEvent({
    calendar: 'team@group.calendar.google.com',
    organizer: 'team@group.calendar.google.com',
  });

  const event = `k3x9m2p7qa.${seeded.id}@team@group.calendar.google.com`;

  const prepared = await ctx.prepare('calendar.change_event', { event, title: 'Renamed' });
  const response = await ctx.attempt('calendar.change_event', { event, title: 'Renamed' });

  expect([prepared, response.kind]).toMatchObject([{ destinations: [] }, 'success']);
});

test('it refuses to change an event on a secondary calendar that the account can only write', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.calendars.push({
    id: 'team@group.calendar.google.com',
    summary: 'Team',
    accessRole: 'writer',
  });

  const seeded = ctx.createEvent({
    calendar: 'team@group.calendar.google.com',
    organizer: 'team@group.calendar.google.com',
  });

  const prepared = await ctx.prepare('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}@team@group.calendar.google.com`,
    title: 'Renamed',
  });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NOT_ORGANIZER'),
  });
});

test('it keeps the comment and the extra guests of each attendee that stays when it sends the guest list back', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org', comment: 'No nuts please', additionalGuests: 2 }],
  });

  await ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, addGuests: ['lee@example.org'] },
    ['sam@example.org', 'lee@example.org'],
  );

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect(stored?.['attendees']).toContainEqual({
    email: 'sam@example.org',
    responseStatus: 'needsAction',
    comment: 'No nuts please',
    additionalGuests: 2,
  });
});

test('it refuses a change that adds only the connected account to an event with no guest', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    addGuests: ['Me@Example.test'],
  });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NO_GUESTS'),
  });
});

test('it leaves the connected account out of the destinations of a change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    addGuests: ['ME@example.test'],
    title: 'Renamed',
  });

  expect(prepared).toMatchObject({ destinations: ['sam@example.org'] });
});

test('it answers destinations changed, not no guests, when the last guest leaves after the approval', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });
  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  invariant(stored, 'the seeded event is stored');

  stored['attendees'] = [{ email: 'me@example.test', self: true, organizer: true }];

  const response = await ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, title: 'Renamed' },
    ['sam@example.org'],
  );

  expect(response.kind).toBe('destinations_changed');
});

test('it shows the old and the new description on the card of a description change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ description: 'Agenda: budget' });
  const description = `${'A long new agenda. '.repeat(30)}Last line.`;

  const prepared = await ctx.prepare('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    description,
  });

  invariant(prepared && 'attachments' in prepared, 'the change is prepared');

  const [bytes] = prepared.attachments ?? [];

  invariant(bytes, 'the card is sealed');

  expect(parseCardAttachment(bytes)).toMatchObject({
    description: 'Agenda: budget',
    descriptionAfter: description,
  });
});

test('it refuses the change of an event with a guest in the tool without guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });

  const prepared = await ctx.prepare('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('HAS_GUESTS'),
  });
});

test('it refuses the change of an event with no guest in the tool with guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NO_GUESTS'),
  });
});

test('it takes the guests of the event and the guests it adds as the destinations', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org' }, { email: 'lee@example.org' }],
  });

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    addGuests: ['Kim@example.org'],
    removeGuests: ['lee@example.org'],
  });

  expect(prepared).toMatchObject({
    destinations: ['sam@example.org', 'lee@example.org', 'kim@example.org'],
  });
});

test('it refuses a change of an event that the account does not organize', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ organizer: 'boss@example.org' });

  const prepared = await ctx.prepare('calendar.change_event_with_guests', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NOT_ORGANIZER'),
  });
});

test('it refuses a change that changes nothing', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare('calendar.change_event', { event: `k3x9m2p7qa.${seeded.id}` });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NOTHING_TO_CHANGE'),
  });
});

test('it refuses a start without an end', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    start: '2026-11-18T15:00:00+11:00',
  });

  expect(prepared).toMatchObject({ status: 'error' });
});

test('it seals the card facts and takes no destination for the tool without guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect(prepared).toMatchObject({ destinations: [], attachments: [expect.any(Uint8Array)] });
});

test('it changes the fields of an event with no guests and asks Google to email no one', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const response = await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
    location: 'Room 4',
    start: '2026-11-18T15:00:00+11:00',
    end: '2026-11-18T15:30:00+11:00',
  });

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect([response.kind, ctx.site.calendar.writes, stored]).toMatchObject([
    'success',
    [{ method: 'PATCH', id: seeded.id, sendUpdates: 'none' }],
    {
      summary: 'Renamed',
      location: 'Room 4',
      start: { dateTime: '2026-11-18T15:00:00+11:00' },
    },
  ]);
});

test('it writes the marker of the action with the change', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect(stored?.['extendedProperties']).toStrictEqual({
    private: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: expect.stringMatching(/^\d+$/u) },
  });
});

test('it keeps the 10 newest markers and deletes the older ones in the same request', async () => {
  const ctx = await setupTest();

  const old = Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `nixie${String(index).padStart(32, '0')}`,
      String(1000 + index),
    ]),
  );

  const seeded = ctx.createEvent({ privateProperties: old });

  await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  invariant(stored, 'the event is stored');

  const kept = Object.keys(parseFakePrivate(stored)).toSorted();

  expect(kept).toStrictEqual(
    [
      'nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03',
      ...Array.from({ length: 9 }, (_, index) => `nixie${String(index + 3).padStart(32, '0')}`),
    ].toSorted(),
  );
});

test('it answers done with no write when the event already holds the marker of the action', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    privateProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1794550000' },
  });

  const response = await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect([response.kind, ctx.site.calendar.writes]).toStrictEqual(['success', []]);
});

test('it adds and removes guests and asks Google to email them', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org' }, { email: 'lee@example.org' }],
  });

  const response = await ctx.attempt(
    'calendar.change_event_with_guests',
    {
      event: `k3x9m2p7qa.${seeded.id}`,
      addGuests: ['kim@example.org'],
      removeGuests: ['lee@example.org'],
    },
    ['sam@example.org', 'lee@example.org', 'kim@example.org'],
  );

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect([
    response.kind,
    ctx.site.calendar.writes[0]?.sendUpdates,
    stored?.['attendees'],
  ]).toMatchObject([
    'success',
    'all',
    [{ email: 'me@example.test' }, { email: 'sam@example.org' }, { email: 'kim@example.org' }],
  ]);
});

test('it answers destinations_changed and writes nothing when the guests differ from the checked ones', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org' }, { email: 'new@example.org' }],
  });

  const response = await ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, title: 'Renamed' },
    ['sam@example.org'],
  );

  expect([response.kind, ctx.site.calendar.writes]).toStrictEqual(['destinations_changed', []]);
});

test('it answers destinations_changed when a guest joins between the read and the write', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });
  const hold = ctx.site.calendar.hold('PATCH');

  const attempt = ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, title: 'Renamed' },
    ['sam@example.org'],
  );

  await hold.reached;

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  Object.assign(stored ?? {}, {
    etag: '"newer"',
    attendees: [
      { email: 'me@example.test', self: true, organizer: true },
      { email: 'sam@example.org' },
      { email: 'late@example.org' },
    ],
  });

  hold.release();

  const response = await attempt;

  expect(response).toMatchObject({ kind: 'destinations_changed' });
});

test('it asks for a retry when only another field changed between the read and the write', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });
  const hold = ctx.site.calendar.hold('PATCH');

  const attempt = ctx.attempt(
    'calendar.change_event_with_guests',
    { event: `k3x9m2p7qa.${seeded.id}`, title: 'Renamed' },
    ['sam@example.org'],
  );

  await hold.reached;

  Object.assign(ctx.site.calendar.events.get('primary')?.get(seeded.id) ?? {}, {
    etag: '"newer"',
    location: 'Moved',
  });

  hold.release();

  const response = await attempt;

  expect([response, ctx.site.calendar.writes]).toMatchObject([
    { kind: 'refused_retryable', reason: expect.stringContaining('CHANGED') },
    [],
  ]);
});

test('it refuses an event that has a guest in the attempt of the tool without guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });

  const response = await ctx.attempt('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect([response, ctx.site.calendar.writes]).toMatchObject([
    { kind: 'refused', reason: expect.stringContaining('HAS_GUESTS') },
    [],
  ]);
});

test('it refuses the change of an event that is gone', async () => {
  const ctx = await setupTest();

  const response = await ctx.attempt('calendar.change_event', {
    event: 'k3x9m2p7qa.gone',
    title: 'Renamed',
  });

  expect(response).toStrictEqual({ kind: 'refused', reason: 'UNKNOWN_EVENT: the event is gone' });
});

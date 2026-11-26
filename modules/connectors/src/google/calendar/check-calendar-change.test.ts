import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const check = (tool: string, args: Record<string, unknown>, queuedAt?: number) => {
    const queued = ctx.findAction(tool).queued;

    invariant(queued?.check, `${tool} has a check`);

    return queued.check({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool,
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations: [],
      attemptStartedAt: ctx.clock.now(),
      ...(queuedAt === undefined ? {} : { queuedAt }),
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

  return {
    ...ctx,
    createArgs: {
      title: 'Q3 review',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
    },
    check,
    createEvent,
  };
}

test('it finds an event that a with-guests create made on a calendar other than the primary', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    calendar: 'team@group.calendar.google.com',
    id: '0b9d3c4e7a214f0e8c551e6f2a9d4c03',
  });

  const outcome = await ctx.check('calendar.create_event_with_guests', {
    ...ctx.createArgs,
    calendar: 'team@group.calendar.google.com',
    guests: ['sam@example.org'],
  });

  expect(outcome).toMatchObject({
    kind: 'found',
    result: { event: expect.stringContaining(`${seeded.id}@team@group.calendar.google.com`) },
  });
});

test('it finds a created event by the ID that the action gives it', async () => {
  const ctx = await setupTest();

  ctx.createEvent({ id: '0b9d3c4e7a214f0e8c551e6f2a9d4c03' });

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome).toStrictEqual({
    kind: 'found',
    result: {
      event: `k3x9m2p7qa.${'0b9d3c4e7a214f0e8c551e6f2a9d4c03'}`,
      link: expect.stringContaining('0b9d3c4e7a214f0e8c551e6f2a9d4c03'),
    },
  });
});

test('it finds a created event that holds the marker when its ID is another', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    privateProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
  });

  const outcome = await ctx.check('calendar.create_event_with_guests', {
    ...ctx.createArgs,
    guests: ['sam@example.org'],
  });

  expect(outcome).toMatchObject({ kind: 'found', result: { event: `k3x9m2p7qa.${seeded.id}` } });
});

test('it finds a created event that was cancelled since', async () => {
  const ctx = await setupTest();

  ctx.createEvent({ id: '0b9d3c4e7a214f0e8c551e6f2a9d4c03' });

  Object.assign(
    ctx.site.calendar.events.get('primary')?.get('0b9d3c4e7a214f0e8c551e6f2a9d4c03') ?? {},
    {
      status: 'cancelled',
    },
  );

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome.kind).toBe('found');
});

test('it answers not found for a created event when both ways find nothing', async () => {
  const ctx = await setupTest();

  ctx.createEvent({ privateProperties: { nixie11111111111111111111111111111111: '1' } });

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome).toStrictEqual({ kind: 'not_found' });
});

test('it answers inconclusive when the search for a created event fails', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events?',
    status: 500,
  });

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test('it finds a created event by its marker even when the read by ID fails', async () => {
  const ctx = await setupTest();

  ctx.createEvent({ privateProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' } });

  ctx.site.calendar.failures.push({
    line: `GET /calendar/v3/calendars/primary/events/${'0b9d3c4e7a214f0e8c551e6f2a9d4c03'}`,
    status: 500,
  });

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome.kind).toBe('found');
});

test('it answers inconclusive for a created event when the read by ID fails and the search finds nothing', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: `GET /calendar/v3/calendars/primary/events/${'0b9d3c4e7a214f0e8c551e6f2a9d4c03'}`,
    status: 500,
  });

  const outcome = await ctx.check('calendar.create_event', ctx.createArgs);

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test.each([
  {
    title: 'holds the marker',
    properties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1795165200' },
    expected: 'found',
  },
  { title: 'lacks it with fewer than 10 markers', properties: {}, expected: 'not_found' },
  {
    title: 'lacks it with 10 other markers',
    properties: Object.fromEntries(
      Array.from({ length: 10 }, (_, index) => [`nixie${String(index).padStart(32, '0')}`, '1']),
    ),
    expected: 'inconclusive',
  },
])('it answers $expected for a change when the event $title', async (row) => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ privateProperties: row.properties });

  const outcome = await ctx.check('calendar.change_event', {
    event: `k3x9m2p7qa.${seeded.id}`,
    title: 'Renamed',
  });

  expect(outcome.kind).toBe(row.expected);
});

test('it answers inconclusive for a change when the event is gone', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.check('calendar.change_event_with_guests', {
    event: 'k3x9m2p7qa.gone',
    title: 'Renamed',
  });

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test.each([
  { title: 'reads cancelled', status: 'cancelled', expected: 'found' },
  { title: 'reads confirmed', status: 'confirmed', expected: 'not_found' },
  { title: 'reads tentative', status: 'tentative', expected: 'not_found' },
])('it answers $expected for a cancel when the event $title', async (row) => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  Object.assign(ctx.site.calendar.events.get('primary')?.get(seeded.id) ?? {}, {
    status: row.status,
  });

  const outcome = await ctx.check('calendar.cancel_event', { event: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome.kind).toBe(row.expected);
});

test('it finds a cancel of an event that Google no longer has', async () => {
  const ctx = await setupTest();

  const outcome = await ctx.check('calendar.cancel_event_with_guests', {
    event: 'k3x9m2p7qa.gone',
  });

  expect(outcome).toStrictEqual({ kind: 'found', result: { event: 'k3x9m2p7qa.gone' } });
});

test('it answers inconclusive for a cancel when the read fails', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  ctx.site.calendar.failures.push({
    line: 'GET /calendar/v3/calendars/primary/events/',
    status: 500,
  });

  const outcome = await ctx.check('calendar.cancel_event', { event: `k3x9m2p7qa.${seeded.id}` });

  expect(outcome).toStrictEqual({ kind: 'inconclusive' });
});

test('it finds a response that the account entry holds, and never answers not found', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ organizer: 'boss@example.org', yourResponse: 'declined' });
  const event = `k3x9m2p7qa.${seeded.id}`;

  const held = await ctx.check('calendar.respond', { event, response: 'declined' });
  const other = await ctx.check('calendar.respond', { event, response: 'accepted' });

  expect([held.kind, other.kind]).toStrictEqual(['found', 'inconclusive']);
});

test('it finds a change by the marker whose value is the time the queue recorded the action', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    privateProperties: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: '1700000000' },
  });

  ctx.clock.advance(3_600_000);

  const outcome = await ctx.check(
    'calendar.create_event_with_guests',
    { ...ctx.createArgs, guests: ['sam@example.org'] },
    1_700_000_000_000,
  );

  expect(outcome).toMatchObject({ kind: 'found', result: { event: `k3x9m2p7qa.${seeded.id}` } });
});

import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

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

  return {
    ...ctx,
    event: {
      title: 'Q3 review',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
    },
    attempt,
  };
}

test('it hands the decision point each guest in lowercase, once, and without the connected account', async () => {
  const ctx = await setupTest();

  const resolved = await ctx.findAction('calendar.create_event_with_guests').tool.resolveInput?.(
    {
      ...ctx.event,
      connection: 'k3x9m2p7qa',
      guests: ['OWNER@Example.test', 'owner@example.test ', 'Me@Example.test'],
    },
    { run: ctx.buildContext().run },
  );

  expect(resolved).toStrictEqual({
    status: 'ok',
    input: { ...ctx.event, connection: 'k3x9m2p7qa', guests: ['owner@example.test'] },
  });
});

test('it refuses guests that name only the connected account', async () => {
  const ctx = await setupTest();

  const resolved = await ctx
    .findAction('calendar.create_event_with_guests')
    .tool.resolveInput?.(
      { ...ctx.event, connection: 'k3x9m2p7qa', guests: ['ME@example.test'] },
      { run: ctx.buildContext().run },
    );

  expect(resolved).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NO_GUESTS'),
  });
});

test('it creates an event with the action ID as its ID and asks Google to email no one', async () => {
  const ctx = await setupTest();
  const response = await ctx.attempt('calendar.create_event', ctx.event);

  expect([response, ctx.site.calendar.writes]).toStrictEqual([
    {
      kind: 'success',
      result: {
        event: `k3x9m2p7qa.${'0b9d3c4e7a214f0e8c551e6f2a9d4c03'}`,
        link: expect.stringContaining('0b9d3c4e7a214f0e8c551e6f2a9d4c03'),
      },
    },
    [
      {
        method: 'POST',
        calendar: 'primary',
        id: '0b9d3c4e7a214f0e8c551e6f2a9d4c03',
        sendUpdates: 'none',
      },
    ],
  ]);
});

test('it writes a private marker with the event whose key holds the action ID', async () => {
  const ctx = await setupTest();

  await ctx.attempt('calendar.create_event', ctx.event);

  const stored = ctx.site.calendar.events.get('primary')?.get('0b9d3c4e7a214f0e8c551e6f2a9d4c03');

  expect(stored?.['extendedProperties']).toStrictEqual({
    private: { nixie0b9d3c4e7a214f0e8c551e6f2a9d4c03: expect.stringMatching(/^\d+$/u) },
  });
});

test('it invites each guest and asks Google to email them', async () => {
  const ctx = await setupTest();

  const response = await ctx.attempt(
    'calendar.create_event_with_guests',
    { ...ctx.event, guests: ['Sam@Example.org'] },
    ['sam@example.org'],
  );

  const stored = ctx.site.calendar.events.get('primary')?.get('0b9d3c4e7a214f0e8c551e6f2a9d4c03');

  expect([
    response.kind,
    ctx.site.calendar.writes[0]?.sendUpdates,
    stored?.['attendees'],
  ]).toStrictEqual([
    'success',
    'all',
    [
      { email: 'me@example.test', self: true, organizer: true, responseStatus: 'accepted' },
      { email: 'sam@example.org', responseStatus: 'needsAction' },
    ],
  ]);
});

test('it creates an all-day event from dates', async () => {
  const ctx = await setupTest();

  await ctx.attempt('calendar.create_event', {
    title: 'Holiday',
    start: '2026-11-20',
    end: '2026-11-21',
  });

  const stored = ctx.site.calendar.events.get('primary')?.get('0b9d3c4e7a214f0e8c551e6f2a9d4c03');

  expect([stored?.['start'], stored?.['end']]).toStrictEqual([
    { date: '2026-11-20' },
    { date: '2026-11-21' },
  ]);
});

test('it puts an event of another calendar in that calendar, and names it in the ID', async () => {
  const ctx = await setupTest();

  const response = await ctx.attempt('calendar.create_event', {
    ...ctx.event,
    calendar: 'team@group.calendar.google.com',
  });

  expect(response).toMatchObject({
    kind: 'success',
    result: {
      event: `k3x9m2p7qa.${'0b9d3c4e7a214f0e8c551e6f2a9d4c03'}@team@group.calendar.google.com`,
    },
  });
});

test('it answers done for a retry that Google answers with 409, and makes no second event', async () => {
  const ctx = await setupTest();

  await ctx.attempt('calendar.create_event', ctx.event);

  const retry = await ctx.attempt('calendar.create_event', ctx.event);

  expect([retry.kind, ctx.site.calendar.writes]).toStrictEqual([
    'success',
    [
      {
        method: 'POST',
        calendar: 'primary',
        id: '0b9d3c4e7a214f0e8c551e6f2a9d4c03',
        sendUpdates: 'none',
      },
    ],
  ]);
});

test('it ends the attempt as ambiguous when Google fails with a server error', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'POST /calendar/v3/calendars/primary/events',
    status: 503,
  });

  const response = await ctx.attempt('calendar.create_event', ctx.event);

  expect(response).toStrictEqual({ kind: 'ambiguous', reason: 'Google answered backendError' });
});

test('it retries after the time that Google gives for a rate limit', async () => {
  const ctx = await setupTest();

  ctx.site.calendar.failures.push({
    line: 'POST /calendar/v3/calendars/primary/events',
    status: 429,
    headers: { 'retry-after': '30' },
  });

  const response = await ctx.attempt('calendar.create_event', ctx.event);

  expect(response).toMatchObject({ kind: 'refused_retryable', retryAfterMs: 30_000 });
});

test('it refuses an event of a connection that was forgotten', async () => {
  const ctx = await setupTest();

  ctx.site.forget('k3x9m2p7qa-id');

  const response = await ctx.attempt('calendar.create_event', ctx.event);

  expect(response).toStrictEqual({ kind: 'refused', reason: 'connection_forgotten' });
});

test('it gives the tool without guests no guest argument, and the one with guests its guests as destinations', async () => {
  const ctx = await setupTest();

  const without = ctx.findAction('calendar.create_event').tool;
  const withGuests = ctx.findAction('calendar.create_event_with_guests').tool;

  expect([
    Object.keys(without.input['properties'] ?? {}).includes('guests'),
    without.declaration.destinations,
    withGuests.declaration.destinations,
    withGuests.declaration.effects,
    without.declaration.effects,
  ]).toStrictEqual([false, [], ['guests'], ['send'], ['write']]);
});

import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const prepare = (tool: string, event: string) =>
    ctx
      .findAction(tool)
      .tool.prepare?.({ connection: 'k3x9m2p7qa', event }, { run: ctx.buildContext().run });

  const attempt = (tool: string, event: string, destinations: string[] = []) => {
    const queued = ctx.findAction(tool).queued;

    invariant(queued, `${tool} runs queued`);

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool,
      arguments: { connection: 'k3x9m2p7qa', event },
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

test('it answers destinations changed, not no guests, when the last guest leaves after the approval', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });
  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  invariant(stored, 'the seeded event is stored');

  stored['attendees'] = [{ email: 'me@example.test', self: true, organizer: true }];

  const response = await ctx.attempt(
    'calendar.cancel_event_with_guests',
    `k3x9m2p7qa.${seeded.id}`,
    ['sam@example.org'],
  );

  expect([response.kind, ctx.site.calendar.writes]).toStrictEqual(['destinations_changed', []]);
});

test('it cancels an event with no guests and asks Google to email no one', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const response = await ctx.attempt('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  expect([
    response,
    ctx.site.calendar.writes,
    ctx.site.calendar.events.get('primary')?.get(seeded.id)?.['status'],
  ]).toStrictEqual([
    { kind: 'success', result: { event: `k3x9m2p7qa.${seeded.id}` } },
    [{ method: 'DELETE', calendar: 'primary', id: seeded.id, sendUpdates: 'none' }],
    'cancelled',
  ]);
});

test('it emails each guest of a cancel with guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });

  const response = await ctx.attempt(
    'calendar.cancel_event_with_guests',
    `k3x9m2p7qa.${seeded.id}`,
    ['sam@example.org'],
  );

  expect([response.kind, ctx.site.calendar.writes[0]?.sendUpdates]).toStrictEqual([
    'success',
    'all',
  ]);
});

test('it takes the guests of the event as the destinations of a cancel with guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org' }, { email: 'lee@example.org' }],
  });

  const prepared = await ctx.prepare(
    'calendar.cancel_event_with_guests',
    `k3x9m2p7qa.${seeded.id}`,
  );

  expect(prepared).toMatchObject({ destinations: ['sam@example.org', 'lee@example.org'] });
});

test('it refuses a cancel of an event with a guest in the tool without guests', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });

  const prepared = await ctx.prepare('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('HAS_GUESTS'),
  });
});

test('it refuses a cancel with guests of an event with none', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare(
    'calendar.cancel_event_with_guests',
    `k3x9m2p7qa.${seeded.id}`,
  );

  expect(prepared).toStrictEqual({
    status: 'error',
    message: expect.stringContaining('NO_GUESTS'),
  });
});

test('it refuses a cancel of an event that the account does not organize', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ organizer: 'boss@example.org' });

  const response = await ctx.attempt('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  expect([response, ctx.site.calendar.writes]).toMatchObject([
    { kind: 'refused', reason: expect.stringContaining('NOT_ORGANIZER') },
    [],
  ]);
});

test('it answers done for a retry of a cancel that Google answers with 410', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();
  const hold = ctx.site.calendar.hold('DELETE');
  const attempt = ctx.attempt('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  await hold.reached;

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  Object.assign(stored ?? {}, { status: 'cancelled' });
  hold.release();

  const response = await attempt;

  expect(response.kind).toBe('success');
});

test('it answers done for an event that is cancelled already, and deletes nothing', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  await ctx.attempt('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  const again = await ctx.attempt('calendar.cancel_event', `k3x9m2p7qa.${seeded.id}`);

  expect([again.kind, ctx.site.calendar.writes]).toMatchObject(['success', [{ method: 'DELETE' }]]);
});

test('it answers destinations_changed and cancels nothing when a guest joined after the decision', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({
    guests: [{ email: 'sam@example.org' }, { email: 'late@example.org' }],
  });

  const response = await ctx.attempt(
    'calendar.cancel_event_with_guests',
    `k3x9m2p7qa.${seeded.id}`,
    ['sam@example.org'],
  );

  expect([response.kind, ctx.site.calendar.writes]).toStrictEqual(['destinations_changed', []]);
});

test('it asks for a retry when the event changed between the read and the cancel', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ guests: [{ email: 'sam@example.org' }] });
  const hold = ctx.site.calendar.hold('DELETE');

  const attempt = ctx.attempt('calendar.cancel_event_with_guests', `k3x9m2p7qa.${seeded.id}`, [
    'sam@example.org',
  ]);

  await hold.reached;

  Object.assign(ctx.site.calendar.events.get('primary')?.get(seeded.id) ?? {}, {
    etag: '"newer"',
    location: 'Moved',
  });

  hold.release();

  const response = await attempt;

  expect(response).toMatchObject({ kind: 'refused_retryable' });
});

import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGmailTools } from '../../test-utils/start-gmail-tools';

async function setupTest() {
  const ctx = await startGmailTools();

  const prepare = (args: Record<string, string>) =>
    ctx
      .findAction('calendar.respond')
      .tool.prepare?.({ connection: 'k3x9m2p7qa', ...args }, { run: ctx.buildContext().run });

  const attempt = (args: Record<string, string>, destinations: string[]) => {
    const queued = ctx.findAction('calendar.respond').queued;

    invariant(queued, 'calendar.respond runs queued');

    return queued.run({
      actionID: '0b9d3c4e-7a21-4f0e-8c55-1e6f2a9d4c03',
      tool: 'calendar.respond',
      arguments: { connection: 'k3x9m2p7qa', ...args },
      attempt: 1,
      snapshotHash: 'sha256:test',
      idempotencyKey: 'key-1',
      destinations,
      replyTargets: destinations,
      attemptStartedAt: ctx.clock.now(),
      actionHash: 'hash-1',
      deadlineAt: null,
    });
  };

  const createEvent = (extra: Partial<Parameters<typeof ctx.site.calendar.seed>[0]> = {}) =>
    ctx.site.calendar.seed({
      title: 'Offsite',
      start: '2026-11-18T14:00:00+11:00',
      end: '2026-11-18T14:30:00+11:00',
      organizer: 'Boss@Example.org',
      ...extra,
    });

  return { ...ctx, prepare, attempt, createEvent };
}

test('it takes the organizer as the destination and the reply target', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const prepared = await ctx.prepare({ event: `k3x9m2p7qa.${seeded.id}`, response: 'accepted' });

  expect(prepared).toMatchObject({
    destinations: ['boss@example.org'],
    replyTargets: ['boss@example.org'],
  });
});

test('it sets the response of the account and asks Google to email the organizer', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const response = await ctx.attempt({ event: `k3x9m2p7qa.${seeded.id}`, response: 'declined' }, [
    'boss@example.org',
  ]);

  const stored = ctx.site.calendar.events.get('primary')?.get(seeded.id);

  expect([response, ctx.site.calendar.writes[0]?.sendUpdates, stored?.['attendees']]).toStrictEqual(
    [
      { kind: 'success', result: { event: `k3x9m2p7qa.${seeded.id}` } },
      'all',
      [
        { email: 'Boss@Example.org', organizer: true, responseStatus: 'accepted' },
        { email: 'me@example.test', responseStatus: 'declined' },
      ],
    ],
  );
});

test('it answers destinations_changed and responds to no one when the organizer differs', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent();

  const response = await ctx.attempt({ event: `k3x9m2p7qa.${seeded.id}`, response: 'accepted' }, [
    'someone@example.org',
  ]);

  expect([response.kind, ctx.site.calendar.writes]).toStrictEqual(['destinations_changed', []]);
});

test('it refuses a response to an event that the account is not invited to', async () => {
  const ctx = await setupTest();

  const seeded = ctx.createEvent({ organizer: 'me@example.test' });

  const prepared = await ctx.prepare({ event: `k3x9m2p7qa.${seeded.id}`, response: 'accepted' });

  expect(prepared).toMatchObject({ status: 'error' });
});

test('it refuses a response to an event that is gone', async () => {
  const ctx = await setupTest();
  const prepared = await ctx.prepare({ event: 'k3x9m2p7qa.gone', response: 'accepted' });

  expect(prepared).toStrictEqual({
    status: 'error',
    message: 'UNKNOWN_EVENT: no event has the ID k3x9m2p7qa.gone',
  });
});

test('it declares the effect send for a response', async () => {
  const ctx = await setupTest();

  expect(ctx.findAction('calendar.respond').tool.declaration.effects).toStrictEqual(['send']);
});

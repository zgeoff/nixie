import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { seedConnectionStatus } from '../test-utils/seed-connection-status';
import { seedGrantEnd } from '../test-utils/seed-grant-end';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const ctx = await startGoogleConnections();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  ctx.google.apiAnswers.set('/gmail/v1/users/me/profile', { status: 503, body: '{}' });

  return {
    ...ctx,
    row,
    readHead: async () => {
      const [newest] = await readRecords(ctx.log, {
        afterSequence: 0,
        order: 'newest',
        limit: 1,
      });

      return newest?.record.sequence ?? 0;
    },
    callGmail: async () => {
      const [live] = await ctx.connections.readLiveContexts();

      invariant(live, 'the connection lives');

      return live.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/profile`);
    },
  };
}

test('it reads a change into failing as an event that names the connection by its label and account', async () => {
  const ctx = await setupTest();
  const before = await ctx.readHead();

  await seedConnectionStatus(ctx, ctx.row.connection_id, {
    status: 'failing',
    reason: 'no_answer',
  });

  const events = await ctx.connections.readStatusEvents({
    after: before,
    through: await ctx.readHead(),
  });

  expect(events).toStrictEqual([
    {
      kind: 'changed',
      sequence: expect.any(Number),
      atMs: expect.any(Number),
      who: {
        connection: ctx.row.short_id,
        connector: 'google',
        label: 'work@example.test',
        account: 'work@example.test',
      },
      status: 'failing',
      reason: 'no_answer',
      lastSuccessAtMs: null,
      removedTools: [],
    },
  ]);
});

test('it reads the answer that ends a break as a return that counts the call that failed in it', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  const afterChange = await ctx.readHead();

  await ctx.callGmail();

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => [event.kind, event.kind === 'returned' ? event.failedCalls : null]),
  ).toStrictEqual([['returned', 1]]);
});

test('it counts no call that failed while the connection worked', async () => {
  const ctx = await setupTest();

  await ctx.callGmail();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  const afterChange = await ctx.readHead();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'active' });

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => [event.kind, event.kind === 'returned' ? event.failedCalls : null]),
  ).toStrictEqual([['returned', 0]]);
});

test('it reads no event of a forgotten connection', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  await ctx.connections.forgetConnection(ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: 0,
    through: await ctx.readHead(),
  });

  expect(events).toStrictEqual([]);
});

test('it reads a reconnect after a break as a return to active', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'needs_consent' });

  const afterChange = await ctx.readHead();

  await ctx.connect('code-work', ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(events.map((event) => event.kind)).toStrictEqual(['returned']);
});

test('it reads a reconnect that renews an expiring grant as a return to active', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * 24 * 60 * 60 * 1000);

  await ctx.connections.runStatusWatch();

  const afterChange = await ctx.readHead();

  await ctx.connect('code-work', ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(events.map((event) => event.kind)).toStrictEqual(['returned']);
});

test('it counts a failed call once, however many requests the call sent', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  const afterChange = await ctx.readHead();
  const [live] = await ctx.connections.readLiveContexts();

  invariant(live, 'the connection lives');

  await live.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/profile`);
  await live.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/labels`);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => (event.kind === 'returned' ? event.failedCalls : null)),
  ).toStrictEqual([1]);
});

test('it counts the job runs that started while the connection was broken', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  const afterChange = await ctx.readHead();

  await ctx.connections.writeRunsWithout(new Set([ctx.row.short_id]));
  await ctx.connections.writeRunsWithout(new Set(['zzzzzzzzzz']));
  await ctx.callGmail();

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => (event.kind === 'returned' ? event.skippedRuns : null)),
  ).toStrictEqual([1]);
});

test('it reads a reconnect that renews an expiring grant before the sweep recorded the expiry as a return', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * 24 * 60 * 60 * 1000);

  const afterChange = await ctx.readHead();

  await ctx.connect('code-work', ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(events.map((event) => event.kind)).toStrictEqual(['returned']);
});

test('it counts a call that failed after the grant ended and before the sweep recorded it', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 60_000);

  const afterChange = await ctx.readHead();

  ctx.clock.advance(61_000);

  await ctx.callGmail();
  await ctx.connections.runStatusWatch();
  await ctx.connect('code-work', ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => [event.kind, event.kind === 'returned' ? event.failedCalls : null]),
  ).toStrictEqual([
    ['changed', null],
    ['returned', 1],
  ]);
});

test('it reads no return of a renewal that leaves an expiring grant within 3 days of its end', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * 24 * 60 * 60 * 1000);

  await ctx.connections.runStatusWatch();

  const afterChange = await ctx.readHead();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 24 * 60 * 60 * 1000);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(events).toStrictEqual([]);
});

test('it reads a renewal past the end of a grant into a grant within 3 days of its end as a change into expiring', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 60_000);

  ctx.clock.advance(61_000);

  await ctx.connections.runStatusWatch();

  const afterChange = await ctx.readHead();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 24 * 60 * 60 * 1000);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => [event.kind, event.kind === 'changed' ? event.status : null]),
  ).toStrictEqual([['changed', 'expiring']]);
});

test('it counts a call that failed after the grant ended when no sweep recorded the end before the reconnect', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 60_000);

  const afterChange = await ctx.readHead();

  ctx.clock.advance(61_000);

  await ctx.callGmail();
  await ctx.connect('code-work', ctx.row.short_id);

  const events = await ctx.connections.readStatusEvents({
    after: afterChange,
    through: await ctx.readHead(),
  });

  expect(
    events.map((event) => [event.kind, event.kind === 'returned' ? event.failedCalls : null]),
  ).toStrictEqual([['returned', 1]]);
});

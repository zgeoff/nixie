import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { seedConnectionStatus } from '../test-utils/seed-connection-status';
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

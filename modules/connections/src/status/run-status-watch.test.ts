import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { seedConnectionStatus } from '../test-utils/seed-connection-status';
import { seedGrantEnd } from '../test-utils/seed-grant-end';
import type { ConnectionsHarnessOptions } from '../test-utils/start-connections-harness';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest(options: ConnectionsHarnessOptions = {}) {
  const ctx = await startGoogleConnections(options);
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  return { ...ctx, row, day: 86_400_000 };
}

test('it writes one record when a break passes 2 days, and none on a later pass', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(2 * ctx.day + 1000);

  const first = await ctx.connections.runStatusWatch();
  const second = await ctx.connections.runStatusWatch();
  const payloads = await ctx.readRecordPayloads('connection.break_lasted');

  expect([first, second, payloads]).toStrictEqual([
    1,
    0,
    [{ connection: ctx.row.connection_id, sinceMs: expect.any(Number) }],
  ]);
});

test('it writes nothing for a break shorter than 2 days', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(ctx.day);

  const written = await ctx.connections.runStatusWatch();

  expect(written).toBe(0);
});

test('it writes a record after the time that the setting names', async () => {
  const ctx = await setupTest({ breakNoticeMs: 3_600_000 });

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'needs_consent' });

  ctx.clock.advance(3_600_000 + 1);

  const written = await ctx.connections.runStatusWatch();

  expect(written).toBe(1);
});

test('it writes one record when the clock takes a connection into expiring', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * ctx.day);

  const first = await ctx.connections.runStatusWatch();
  const second = await ctx.connections.runStatusWatch();
  const payloads = await ctx.readRecordPayloads('connection.status_reached');

  expect([first, second, payloads]).toStrictEqual([
    1,
    0,
    [
      {
        connection: ctx.row.connection_id,
        status: 'expiring',
        endsAtMs: ctx.clock.now() + 2 * ctx.day,
      },
    ],
  ]);
});

test('it lets the events block read a break that passed 2 days as one event', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(2 * ctx.day + 1000);

  await ctx.connections.runStatusWatch();

  const events = await ctx.connections.readStatusEvents({ after: 0, through: 1_000_000 });

  expect(events.map((event) => event.kind)).toStrictEqual(['changed', 'lasted']);
});

test('it writes no second record for a break whose retries moved the time of its status', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(2 * ctx.day + 1000);

  await ctx.connections.runStatusWatch();

  await seedConnectionStatus(ctx, ctx.row.connection_id, {
    status: 'failing',
    sinceMs: ctx.clock.now(),
  });

  ctx.clock.advance(ctx.day);

  const written = await ctx.connections.runStatusWatch();

  expect(written).toBe(0);
});

test('it counts a break from its first failure, though a retry moved the time of its status', async () => {
  const ctx = await setupTest();

  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(ctx.day + 1000);

  await seedConnectionStatus(ctx, ctx.row.connection_id, {
    status: 'failing',
    sinceMs: ctx.clock.now(),
  });

  ctx.clock.advance(ctx.day + 1000);

  const written = await ctx.connections.runStatusWatch();

  expect(written).toBe(1);
});

test('it writes a record when the grant of a failing connection ends', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 60_000);
  await seedConnectionStatus(ctx, ctx.row.connection_id, { status: 'failing' });

  ctx.clock.advance(120_000);

  await ctx.connections.runStatusWatch();

  const payloads = await ctx.readRecordPayloads('connection.status_reached');

  expect(payloads.map((payload) => payload['status'])).toStrictEqual(['needs_consent']);
});

test('it writes a record again for an expiry that a reconnect renewed', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * ctx.day);

  await ctx.connections.runStatusWatch();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 2 * ctx.day);

  const written = await ctx.connections.runStatusWatch();

  expect(written).toBe(1);
});

test('it counts a break from the end of its grant, though the sweep ran a second after it', async () => {
  const ctx = await setupTest();

  await seedGrantEnd(ctx, ctx.row, 'code-work', 60_000);

  const endsAtMs = ctx.clock.now() + 60_000;

  ctx.clock.advance(61_000);

  await ctx.connections.runStatusWatch();

  ctx.clock.advance(2 * ctx.day - 500);

  const written = await ctx.connections.runStatusWatch();
  const payloads = await ctx.readRecordPayloads('connection.break_lasted');

  expect([written, payloads]).toStrictEqual([
    1,
    [{ connection: ctx.row.connection_id, sinceMs: endsAtMs }],
  ]);
});

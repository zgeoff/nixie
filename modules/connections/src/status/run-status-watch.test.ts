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

  await seedGrantEnd(ctx, ctx.row.connection_id, ctx.clock.now() + 2 * ctx.day);

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

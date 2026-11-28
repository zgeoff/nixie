import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import type { ConnectorAction } from '../connector/types';
import { seedConnectionStatus } from '../test-utils/seed-connection-status';
import { seedGrantEnd } from '../test-utils/seed-grant-end';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const actions: ConnectorAction[] = ['stub.read_mail', 'stub.read_file'].map((name) => ({
    tool: buildMockToolDefinition({ name }),
    scopes: [],
    reconcile: { kind: 'none' },
  }));

  const ctx = await startGoogleConnections({ actions });

  const connect = async (code: string) => {
    const connected = await ctx.connect(code);

    invariant(connected.kind === 'finished', 'the consent finishes');

    const rows = await ctx.readRows();

    const row = rows.at(-1);

    invariant(row, 'the connection is stored');

    return row;
  };

  return { ...ctx, connectAccount: connect };
}

test('it lists nothing while every connection is active', async () => {
  const ctx = await setupTest();

  await ctx.connectAccount('code-work');

  const attention = await ctx.connections.readAttention();

  expect(attention).toStrictEqual([]);
});

test('it lists a failing connection with its reason, its times and no removed tool', async () => {
  const ctx = await setupTest();
  const row = await ctx.connectAccount('code-work');

  await seedConnectionStatus(ctx, row.connection_id, {
    status: 'failing',
    reason: 'service_error',
    sinceMs: 1000,
    lastSuccessAtMs: 500,
  });

  const attention = await ctx.connections.readAttention();

  expect(attention).toStrictEqual([
    {
      connection: row.short_id,
      connector: 'google',
      label: 'work@example.test',
      account: 'work@example.test',
      status: 'failing',
      reason: 'service_error',
      sinceMs: 1000,
      lastSuccessAtMs: 500,
      removedTools: [],
    },
  ]);
});

test('it lists the tools that a connection needing consent stops', async () => {
  const ctx = await setupTest();
  const row = await ctx.connectAccount('code-work');

  await seedConnectionStatus(ctx, row.connection_id, { status: 'needs_consent' });

  const [listed] = await ctx.connections.readAttention();

  expect([listed?.status, listed?.reason, listed?.removedTools]).toStrictEqual([
    'needs_consent',
    null,
    ['stub.read_mail', 'stub.read_file'],
  ]);
});

test('it lists a connection whose grant ends within 3 days as expiring, from the day the window opened', async () => {
  const ctx = await setupTest();
  const row = await ctx.connectAccount('code-work');

  const endsAtMs = ctx.clock.now() + 2 * 24 * 60 * 60 * 1000;

  await seedGrantEnd(ctx, row.connection_id, endsAtMs);

  const [listed] = await ctx.connections.readAttention();

  expect([listed?.status, listed?.sinceMs, listed?.removedTools]).toStrictEqual([
    'expiring',
    endsAtMs - 3 * 24 * 60 * 60 * 1000,
    [],
  ]);
});

test('it lists a connection past the end of its grant as needing consent from that end', async () => {
  const ctx = await setupTest();
  const row = await ctx.connectAccount('code-work');

  const endsAtMs = ctx.clock.now() - 60_000;

  await seedGrantEnd(ctx, row.connection_id, endsAtMs);

  const [listed] = await ctx.connections.readAttention();

  expect([listed?.status, listed?.sinceMs]).toStrictEqual(['needs_consent', endsAtMs]);
});

test('it never lists a forgotten connection', async () => {
  const ctx = await setupTest();
  const row = await ctx.connectAccount('code-work');

  await seedConnectionStatus(ctx, row.connection_id, { status: 'needs_consent' });

  await ctx.connections.forgetConnection(row.short_id);

  const attention = await ctx.connections.readAttention();

  expect(attention).toStrictEqual([]);
});

test('it lists only the pinned connections when it is given a scope', async () => {
  const ctx = await setupTest();
  const work = await ctx.connectAccount('code-work');
  const home = await ctx.connectAccount('code-home');

  await seedConnectionStatus(ctx, work.connection_id, { status: 'needs_consent' });
  await seedConnectionStatus(ctx, home.connection_id, { status: 'needs_consent' });

  const attention = await ctx.connections.readAttention(new Set([home.short_id]));

  expect(attention.map((entry) => entry.connection)).toStrictEqual([home.short_id]);
});

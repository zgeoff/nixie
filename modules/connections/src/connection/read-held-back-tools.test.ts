import { expect, test } from 'bun:test';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import type { ConnectorAction } from '../connector/types';
import { seedConnectionStatus } from '../test-utils/seed-connection-status';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const action: ConnectorAction = {
    tool: buildMockToolDefinition({ name: 'stub.read_file' }),
    scopes: ['drive.file'],
    reconcile: { kind: 'none' },
  };

  const ctx = await startGoogleConnections({ actions: [action] });

  return { ...ctx };
}

test('it holds back a tool whose scope the owner left out, and lists it again once the scope returns', async () => {
  const ctx = await setupTest();

  ctx.google.apiAnswers.set('/drive/v3/files', {
    status: 403,
    body: '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
  });

  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const before = await ctx.connections.readHeldBackTools();

  ctx.google.apiAnswers.delete('/drive/v3/files');

  await ctx.connections.runDailyChecks();

  const after = await ctx.connections.readHeldBackTools();

  expect([before, after]).toStrictEqual([['stub.read_file'], []]);
});

test('it holds nothing back before any connection exists', async () => {
  const ctx = await setupTest();
  const held = await ctx.connections.readHeldBackTools();

  expect(held).toStrictEqual([]);
});

test('it holds back the same tools and keeps the same connections listed when a status changes', async () => {
  const ctx = await setupTest();
  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  invariant(row, 'the connection is stored');

  const readList = async () => {
    const held = await ctx.connections.readHeldBackTools();
    const states = await ctx.connections.readStates();
    const live = await ctx.connections.readLiveContexts();

    return {
      held,
      states: states.map((state) => state.connection),
      live: live.map((entry) => entry.connection),
    };
  };

  const before = await readList();

  await seedConnectionStatus(ctx, row.connection_id, { status: 'needs_consent' });

  const during = await readList();

  await seedConnectionStatus(ctx, row.connection_id, { status: 'failing', reason: 'no_answer' });

  const failing = await readList();

  expect([during, failing]).toStrictEqual([before, before]);
});

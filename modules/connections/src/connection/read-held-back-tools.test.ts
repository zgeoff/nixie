import { expect, test } from 'bun:test';
import type { ConnectorAction } from '@heynixie/connectors';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import invariant from 'tiny-invariant';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const { run: _, ...tool } = buildMockToolDefinition({ name: 'stub.read_file' });

  const action: ConnectorAction = {
    tool,
    scopes: ['drive.file'],
    reconcile: { kind: 'none' },
    run: () => Promise.resolve({ kind: 'done', result: {} }),
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

import { expect, test } from 'bun:test';
import { subscribeToChanged } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ConnectionsHarnessOptions } from '../test-utils/start-connections-harness';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest(options: ConnectionsHarnessOptions = {}) {
  const ctx = await startGoogleConnections(options);

  ctx.google.apiAnswers.set('/drive/v3/files', {
    status: 403,
    body: '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
  });

  const connected = await ctx.connect('code-work');

  invariant(connected.kind === 'finished', 'the consent finishes');

  const [row] = await ctx.readRows();

  return { ...ctx, connectionID: row?.connection_id ?? '' };
}

test('it clears a scope that was missing once the API is on again', async () => {
  const ctx = await setupTest();
  const [before] = await ctx.connections.list();

  ctx.google.apiAnswers.delete('/drive/v3/files');

  const checked = await ctx.connections.runDailyChecks();
  const [after] = await ctx.connections.list();

  expect([
    before?.missing,
    checked,
    after?.missing,
    after?.scopes.includes('drive.file'),
  ]).toStrictEqual([[{ scope: 'drive.file', reason: 'api_disabled' }], 1, [], true]);
});

test('it announces a change of the connections when a check saves its result', async () => {
  const ctx = await setupTest();

  const changes: (readonly string[])[] = [];

  subscribeToChanged(ctx.log.writer, (topics) => {
    changes.push(topics);
  });

  await ctx.connections.runCheck(ctx.connectionID);

  expect(changes).toStrictEqual([['connections']]);
});

test('it keeps what the last check found when Google answers with a server error', async () => {
  const ctx = await setupTest();

  ctx.google.apiAnswers.set('/gmail/v1/users/me/labels', { status: 503, body: '' });

  const result = await ctx.connections.runCheck(ctx.connectionID);
  const [listed] = await ctx.connections.list();

  expect([result, listed?.missing]).toStrictEqual([
    'failed',
    [{ scope: 'drive.file', reason: 'api_disabled' }],
  ]);
});

test('it skips a connection that is forgotten', async () => {
  const ctx = await setupTest();
  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const result = await ctx.connections.runCheck(ctx.connectionID);

  expect(result).toBe('skipped');
});

test('it keeps the scopes of a consent that renewed the connection while a check was under way', async () => {
  const reads: { afterCheck: () => Promise<void> } = { afterCheck: () => Promise.resolve() };

  const ctx = await setupTest({
    wrapCheck: (check) => async (connection, context) => {
      const report = await check(connection, context);

      await reads.afterCheck();

      return report;
    },
  });

  reads.afterCheck = async () => {
    reads.afterCheck = () => Promise.resolve();

    ctx.google.apiAnswers.delete('/drive/v3/files');

    await ctx.connect('code-work');
  };

  const result = await ctx.connections.runCheck(ctx.connectionID);
  const [listed] = await ctx.connections.list();

  expect([result, listed?.missing]).toStrictEqual(['checked', []]);
});

test('it keeps what the last check found when Google answers with a quota error', async () => {
  const ctx = await setupTest();

  ctx.google.apiAnswers.set('/gmail/v1/users/me/labels', {
    status: 403,
    body: '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
  });

  const result = await ctx.connections.runCheck(ctx.connectionID);
  const [listed] = await ctx.connections.list();

  expect([result, listed?.missing]).toStrictEqual([
    'failed',
    [{ scope: 'drive.file', reason: 'api_disabled' }],
  ]);
});

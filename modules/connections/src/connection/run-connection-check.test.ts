import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const ctx = await startGoogleConnections();

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

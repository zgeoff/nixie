import { expect, test } from 'bun:test';
import { googleScopes, startGoogleConnections } from './start-google-connections';

test('it registers a client and connects an account of the fake Google', async () => {
  const ctx = await startGoogleConnections();
  const result = await ctx.connect('code-work');
  const listed = await ctx.connections.list();

  expect([result.kind, listed.map((entry) => [entry.account, entry.scopes])]).toStrictEqual([
    'finished',
    [['work@example.test', [...googleScopes]]],
  ]);
});

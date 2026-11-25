import { expect, test } from 'bun:test';
import { startGoogleConnections } from '../test-utils/start-google-connections';

async function setupTest() {
  const ctx = await startGoogleConnections();

  await ctx.connect('code-work');

  const [row] = await ctx.readRows();
  const context = await ctx.connections.readContext(row?.connection_id ?? '');

  return { ...ctx, context, connectionID: row?.connection_id ?? '' };
}

test('it gives a live connection its short ID, its account and a fetcher that adds the token', async () => {
  const ctx = await setupTest();

  await ctx.context?.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/messages`);

  const sent = ctx.provider.requests.at(-1);

  expect([
    ctx.context?.account,
    ctx.context?.connection.length,
    sent?.path,
    sent?.authorization,
  ]).toStrictEqual([
    'work@example.test',
    10,
    '/gmail/v1/users/me/messages',
    'Bearer google-access-1',
  ]);
});

test.each([
  { title: 'the token endpoint', path: '/token' },
  { title: 'the revoke endpoint', path: '/revoke' },
  { title: 'a path under /oauth2/', path: '/oauth2/v1/tokeninfo' },
])('it refuses a request of the fetcher to $title', async (row) => {
  const ctx = await setupTest();

  const origin = row.path === '/oauth2/v1/tokeninfo' ? ctx.provider.apiOrigin : ctx.provider.origin;
  const sending = ctx.context?.fetch(`${origin}${row.path}`);

  expect(sending).rejects.toThrow(
    /(?:is an OAuth endpoint|is not an origin this credential may reach)/u,
  );
});

test('it refuses the authorize host to the fetcher', async () => {
  const ctx = await setupTest();

  const sending = ctx.context?.fetch(
    `${ctx.provider.origin.replace('auth.test', 'accounts.test')}/o`,
  );

  expect(sending).rejects.toThrow(
    /(?:is an OAuth endpoint|is not an origin this credential may reach)/u,
  );
});

test('it answers null for a connection that is forgotten', async () => {
  const ctx = await setupTest();
  const [listed] = await ctx.connections.list();

  await ctx.connections.forgetConnection(listed?.connection ?? '');

  const context = await ctx.connections.readContext(ctx.connectionID);

  expect(context).toBeNull();
});

test('it answers null for an ID that is no connection', async () => {
  const ctx = await setupTest();
  const context = await ctx.connections.readContext('no-such-connection');

  expect(context).toBeNull();
});

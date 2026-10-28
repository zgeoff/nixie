import { expect, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient } from '@tanstack/react-query';
import { buildBrowserClient } from './build-browser-client';
import { readRouteSession } from './read-route-session';
import { createDeviceSession } from './test-utils/create-device-session';

function setupTest() {
  const client = buildBrowserClient();

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  return { context: { client, queryClient, queryUtils: buildQueryUtils(client) } };
}

test('it reads the session of a signed-in device as live', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const loaded = await readRouteSession(ctx.context);

  expect(loaded).toStrictEqual({ session: 'live' });
});

// bun test resolves the isomorphic server check to the server, as the Start server render does.
test('it leaves the session of a device with no cookie unchecked', async () => {
  const ctx = setupTest();

  const loaded = await readRouteSession(ctx.context);

  expect(loaded).toStrictEqual({ session: 'unchecked' });
});

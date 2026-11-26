import { expect, test } from 'bun:test';
import { buildQueryUtils } from '@heynixie/contract';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRouter,
} from '@tanstack/react-router';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { buildBrowserClient } from '../client/build-browser-client';
import { featureStore } from '../mocks/feature-store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { NixieClientContext } from '../utils/nixie-client-context';
import { CallContext } from './call-context';
import { CallGate } from './call-gate';

async function setupTest() {
  await createDeviceSession();

  const client = buildBrowserClient();

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  const queryUtils = buildQueryUtils(client);

  // a signed-in page has read the session, which is what lets the features read start
  await queryClient.query({
    ...queryUtils.sessions.list.queryOptions(),
    staleTime: 'static',
  });

  const mounts: string[] = [];

  // Records each mount, so a test sees the subtree under the gate mount again.
  const MountProbe = (): ReactNode => {
    useEffect(() => {
      mounts.push('mounted');
    }, []);

    return null;
  };

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/'] }),
    routeTree: createRootRoute({
      component: () => (
        <CallGate>
          <MountProbe />
          <CallContext.Consumer>
            {(call) => <p>{call === undefined ? 'no call provider' : 'call provider'}</p>}
          </CallContext.Consumer>
        </CallGate>
      ),
    }),
  });

  return {
    mounts,
    renderGate: () =>
      render(
        <QueryClientProvider client={queryClient}>
          <NixieClientContext value={{ client, queryUtils }}>
            <RouterProvider router={router} />
          </NixieClientContext>
        </QueryClientProvider>,
      ),
  };
}

test('it leaves the call provider out while voice is off', async () => {
  const ctx = await setupTest();

  await featureStore.featuresOff.create({ feature: 'voice' });

  const rendered = ctx.renderGate();

  const probe = await rendered.findByText('no call provider');

  expect(probe).toBeInTheDocument();
});

test('it mounts the call provider while voice is on', async () => {
  const ctx = await setupTest();

  const rendered = ctx.renderGate();

  const probe = await rendered.findByText('call provider');

  expect(probe).toBeInTheDocument();
});

test('it keeps the tree under the gate mounted when nixie answers that voice is off', async () => {
  const ctx = await setupTest();

  await featureStore.featuresOff.create({ feature: 'voice' });

  const rendered = ctx.renderGate();

  await rendered.findByText('no call provider');

  expect(ctx.mounts).toStrictEqual(['mounted']);
});

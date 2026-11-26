import { expect, test } from 'bun:test';
import { network } from '@heynixie/mock-server';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { AppShell } from '../components/app-shell';
import { SignedInPage } from '../components/signed-in-page';
import { DeviceView } from '../device/device-view';
import { buildStubCallEnvironment } from '../test-utils/build-stub-call-environment';
import { createDeviceSession } from '../test-utils/create-device-session';
import { render } from '../test-utils/render';
import { CallEnvironmentContext } from './call-environment';
import { CallProvider } from './call-provider';
import { CallScreen } from './call-screen';

function setupTest() {
  const stub = buildStubCallEnvironment({ microphoneError: null });

  const rootRoute = createRootRoute({
    component: () => (
      <CallEnvironmentContext value={stub.environment}>
        <CallProvider isOn>
          <AppShell>
            <Outlet />
          </AppShell>
        </CallProvider>
      </CallEnvironmentContext>
    ),
  });

  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/call', component: CallScreen }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: '/device-view',
      component: () => (
        <SignedInPage onRefresh={() => {}} session="live">
          <DeviceView />
        </SignedInPage>
      ),
    }),
  ]);

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/call'] }),
    routeTree,
  });

  return { stub, user: userEvent.setup(), mount: () => render(<RouterProvider router={router} />) };
}

test('it keeps the call live on the device view and brings the user back to the call screen', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  network.use(
    http.post('https://nixie.test/rpc/calls/start', () =>
      HttpResponse.json({ json: { callID: 'c1', state: 'connecting', thread: 't1' }, meta: [] }),
    ),
    http.post('https://nixie.test/rpc/calls/connect', () =>
      HttpResponse.json({ json: { sdpAnswer: 'answer-1' }, meta: [] }),
    ),
    http.post('https://nixie.test/rpc/calls/get', () =>
      HttpResponse.json({
        json: { callID: 'c1', state: 'live', endedBy: null, reconnect: null },
        meta: [],
      }),
    ),
  );

  const rendered = ctx.mount();

  const start = await rendered.findByRole('button', { name: 'Start a call' });

  await ctx.user.click(start);
  await rendered.findByRole('button', { name: /hang up/iu });

  const link = rendered.getAllByRole('link', { name: 'Device view' }).at(0);

  invariant(link, 'the menu has a Device view link');

  await ctx.user.click(link);

  const bar = await rendered.findByRole('region', { name: 'Call in progress' });
  const back = await rendered.findByRole('link', { name: 'Back to the call' });

  expect(bar).toBeVisible();

  await ctx.user.click(back);

  const hangUp = await rendered.findByRole('button', { name: /hang up/iu });

  expect(hangUp).toBeVisible();

  expect([
    ctx.stub.microphoneRequests(),
    ctx.stub.stoppedTracks(),
    ctx.stub.peers.length,
  ]).toStrictEqual([1, 0, 1]);
});

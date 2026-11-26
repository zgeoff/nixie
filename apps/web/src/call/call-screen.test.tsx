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
import { fireEvent } from '@testing-library/react';
import { HttpResponse, http } from 'msw';
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
        <CallProvider>
          <Outlet />
        </CallProvider>
      </CallEnvironmentContext>
    ),
  });

  const routeTree = rootRoute.addChildren([
    createRoute({ getParentRoute: () => rootRoute, path: '/call', component: CallScreen }),
  ]);

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: ['/call'] }),
    routeTree,
  });

  return { mount: () => render(<RouterProvider router={router} />) };
}

test('it says the budget ran out when the hang-up reply names the budget before any live read says so', async () => {
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
    http.post('https://nixie.test/rpc/calls/hangUp', () =>
      HttpResponse.json({ json: { callID: 'c1', state: 'ended', endedBy: 'budget' }, meta: [] }),
    ),
  );

  const ctx = setupTest();
  const rendered = ctx.mount();

  const start = await rendered.findByRole('button', { name: 'Start a call' });

  fireEvent.click(start);

  const hangUp = await rendered.findByRole('button', { name: /hang up/iu });

  fireEvent.click(hangUp);

  const ended = await rendered.findByText('The call budget ran out.');

  expect(ended).toBeTruthy();
  expect(rendered.queryByText('You hung up.')).toBeNull();
});

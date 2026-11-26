import { expect, onTestFinished, test } from 'bun:test';
import {
  Outlet,
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { CallEnvironmentContext } from '../call/call-environment';
import { CallProvider } from '../call/call-provider';
import { CallScreen } from '../call/call-screen';
import { deviceStore } from '../mocks/device-store';
import { endMockDeviceStreams, mockLive } from '../mocks/mock-live';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { buildStubCallEnvironment } from '../test-utils/build-stub-call-environment';
import { createDeviceSession } from '../test-utils/create-device-session';
import { createFullSession } from '../test-utils/create-full-session';
import { createScreenSession } from '../test-utils/create-screen-session';
import { render } from '../test-utils/render';
import { DevicePage } from './device-page';

function setupTest(path = '/device') {
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
    createRoute({ getParentRoute: () => rootRoute, path: '/device', component: DevicePage }),
  ]);

  const router = createRouter({
    history: createMemoryHistory({ initialEntries: [path] }),
    routeTree,
  });

  return {
    stub,
    user: userEvent.setup(),
    mount: () => render(<RouterProvider router={router} />),
    openDevicePage: () => act(() => router.navigate({ to: '/device' })),
  };
}

test('it shows the enrolment form to a browser with no device session', async () => {
  const ctx = setupTest();
  const rendered = ctx.mount();

  const heading = await rendered.findByRole('heading', { name: 'Enrol this browser' });

  expect(heading).toBeVisible();
});

test('it starts an enrolled device with its screen off, and lets the device switch it on', async () => {
  const ctx = setupTest();

  await createScreenSession();

  const rendered = ctx.mount();

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  await ctx.user.click(button);

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
});

test('it keeps the screen on for a device whose screen the server holds on', async () => {
  const ctx = setupTest();

  const session = await createScreenSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: true });

  const rendered = ctx.mount();

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
});

test('it leaves a screen that is off alone, whatever the browser stored before', async () => {
  const ctx = setupTest();

  await createScreenSession();

  globalThis.localStorage.setItem('nixie.device.screen', 'on');

  onTestFinished(() => {
    globalThis.localStorage.clear();
  });

  const rendered = ctx.mount();

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  expect(button).toBeVisible();
  expect(deviceStore.screenSwitches.findMany()).toStrictEqual([]);
});

test('it opens a client device that the server holds off with its screen off, and writes nothing', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: false });

  const rendered = ctx.mount();

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  expect(button).toBeVisible();

  expect(deviceStore.screenSwitches.findMany()).toStrictEqual([
    expect.objectContaining({ sessionID: session.sessionID, isOn: false }),
  ]);
});

test('it keeps the stream of a client device open while its screen is off', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: false });

  const rendered = ctx.mount();

  await rendered.findByRole('button', { name: 'Switch on screen' });

  await waitFor(() => {
    expect(mockLive.deviceOpenCount).toBe(1);
  });
});

test('it drops what the full-screen device showed once its session is revoked', async () => {
  const ctx = setupTest();

  const session = await createScreenSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: true });

  const rendered = ctx.mount();

  await rendered.findByRole('heading', { name: 'Saturday' });

  await store.sessions.update(session, {
    data(draft) {
      draft.revokedAt = new Date();
    },
  });

  endMockDeviceStreams();

  await waitFor(
    () => {
      expect(rendered.queryByRole('heading', { name: 'Saturday' })).toBeNull();
    },
    { timeout: 10_000 },
  );
});

test('it signs the device out and shows the enrolment form', async () => {
  const ctx = setupTest();

  const session = await createScreenSession();

  const rendered = ctx.mount();

  const button = await rendered.findByRole('button', { name: 'Sign out' });

  await ctx.user.click(button);

  const heading = await rendered.findByRole('heading', { name: 'Enrol this browser' });

  expect(heading).toBeVisible();

  expect(
    store.sessions.findFirst((query) => query.where({ sessionID: session.sessionID })),
  ).toMatchObject({
    revokedAt: expect.toBeDate(),
  });
});

test('it ends a live call and stops its microphone before it signs the device out', async () => {
  const ctx = setupTest('/call');

  const session = await createDeviceSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: false });

  server.use(
    http.post('*/rpc/calls/start', () =>
      HttpResponse.json({ json: { callID: 'c1', state: 'connecting', thread: 't1' }, meta: [] }),
    ),
    http.post('*/rpc/calls/connect', () =>
      HttpResponse.json({ json: { sdpAnswer: 'answer-1' }, meta: [] }),
    ),
    http.post('*/rpc/calls/get', () =>
      HttpResponse.json({
        json: { callID: 'c1', state: 'live', endedBy: null, reconnect: null },
        meta: [],
      }),
    ),
    http.post('*/rpc/calls/hangUp', () =>
      HttpResponse.json({ json: { callID: 'c1', state: 'ended', endedBy: 'you' }, meta: [] }),
    ),
  );

  const rendered = ctx.mount();

  const start = await rendered.findByRole('button', { name: 'Start a call' });

  await ctx.user.click(start);
  await rendered.findByRole('button', { name: /hang up/iu });
  await ctx.openDevicePage();
  await rendered.findByRole('heading', { name: 'Device mode' });
  await rendered.findByRole('region', { name: 'Call in progress' });
  await ctx.user.click(rendered.getByRole('button', { name: 'Sign out' }));
  await rendered.findByRole('heading', { name: 'Enrol this browser' });

  expect([
    ctx.stub.stoppedTracks(),
    rendered.queryByRole('region', { name: 'Call in progress' }),
  ]).toStrictEqual([1, null]);
});

test('it signs the device out when the hang-up request of a live call fails', async () => {
  const ctx = setupTest('/call');

  const session = await createDeviceSession();

  await deviceStore.screenSwitches.create({ sessionID: session.sessionID, isOn: false });

  server.use(
    http.post('*/rpc/calls/start', () =>
      HttpResponse.json({ json: { callID: 'c1', state: 'connecting', thread: 't1' }, meta: [] }),
    ),
    http.post('*/rpc/calls/connect', () =>
      HttpResponse.json({ json: { sdpAnswer: 'answer-1' }, meta: [] }),
    ),
    http.post('*/rpc/calls/get', () =>
      HttpResponse.json({
        json: { callID: 'c1', state: 'live', endedBy: null, reconnect: null },
        meta: [],
      }),
    ),
    http.post('*/rpc/calls/hangUp', () => HttpResponse.error()),
  );

  const rendered = ctx.mount();

  const start = await rendered.findByRole('button', { name: 'Start a call' });

  await ctx.user.click(start);
  await rendered.findByRole('button', { name: /hang up/iu });
  await ctx.openDevicePage();

  const signOut = await rendered.findByRole('button', { name: 'Sign out' });

  await ctx.user.click(signOut);
  await rendered.findByRole('heading', { name: 'Enrol this browser' });

  expect(ctx.stub.stoppedTracks()).toBe(1);
});

test('it keeps the device signed in and says so when the sign out fails', async () => {
  const ctx = setupTest();

  const session = await createScreenSession();

  server.use(http.post('*/rpc/sessions/signOut', () => HttpResponse.error(), { once: true }));

  const rendered = ctx.mount();

  const button = await rendered.findByRole('button', { name: 'Sign out' });

  await ctx.user.click(button);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('could not sign out');

  expect(
    store.sessions.findFirst((query) => query.where({ sessionID: session.sessionID })),
  ).toMatchObject({ revokedAt: null });
});

test('it shows the registration form to a full session that holds no device', async () => {
  const ctx = setupTest();

  await createFullSession();

  const rendered = ctx.mount();

  const heading = await rendered.findByRole('heading', { name: 'Use this browser as a device' });

  expect(heading).toBeVisible();
  expect(rendered.queryByRole('heading', { name: 'Enrol this browser' })).toBeNull();
});

test('it registers the named device on the session it holds, then shows the screen the server gave it', async () => {
  const ctx = setupTest();

  const session = await createFullSession();

  const rendered = ctx.mount();

  const name = await rendered.findByLabelText('Device name');

  await ctx.user.clear(name);
  await ctx.user.type(name, 'kitchen tab');
  await ctx.user.click(rendered.getByRole('button', { name: 'Register device' }));

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();

  expect([
    deviceStore.hasDevice(session.sessionID),
    store.sessions.findFirst((query) => query.where({ sessionID: session.sessionID })),
  ]).toStrictEqual([true, expect.objectContaining({ revokedAt: null, token: session.token })]);
});

test('it says so when the registration fails', async () => {
  const ctx = setupTest();

  await createFullSession();

  server.use(http.post('*/rpc/devices/register', () => HttpResponse.error(), { once: true }));

  const rendered = ctx.mount();

  const submit = await rendered.findByRole('button', { name: 'Register device' });

  await ctx.user.click(submit);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('Registration failed');
});

test('it shows the client device of a full session full screen', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = ctx.mount();

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
  expect(rendered.queryByRole('button', { name: 'Switch on screen' })).toBeNull();
});

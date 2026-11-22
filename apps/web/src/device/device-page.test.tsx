import { expect, onTestFinished, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { deviceStore } from '../mocks/device-store';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
import { createFullSession } from '../test-utils/create-full-session';
import { render } from '../test-utils/render';
import { DevicePage } from './device-page';

function setupTest() {
  globalThis.localStorage.clear();

  onTestFinished(() => {
    globalThis.localStorage.clear();
  });

  return { user: userEvent.setup() };
}

test('it shows the enrolment form to a browser with no device session', async () => {
  setupTest();

  const rendered = render(<DevicePage />);

  const heading = await rendered.findByRole('heading', { name: 'Enrol this browser' });

  expect(heading).toBeVisible();
});

test('it starts an enrolled device with its screen off, and lets the device switch it on', async () => {
  const ctx = setupTest();

  await createDeviceSession();

  const rendered = render(<DevicePage />);

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  await ctx.user.click(button);

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
});

test('it keeps the screen on for a device that left it on', async () => {
  setupTest();

  await createDeviceSession();

  globalThis.localStorage.setItem('nixie.device.screen', 'on');

  const rendered = render(<DevicePage />);

  const heading = await rendered.findByRole('heading', { name: 'Saturday' });

  expect(heading).toBeVisible();
});

test('it signs the device out and shows the enrolment form', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  const rendered = render(<DevicePage />);

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

test('it keeps the device signed in and says so when the sign out fails', async () => {
  const ctx = setupTest();

  const session = await createDeviceSession();

  server.use(http.post('*/rpc/sessions/signOut', () => HttpResponse.error(), { once: true }));

  const rendered = render(<DevicePage />);

  const button = await rendered.findByRole('button', { name: 'Sign out' });

  await ctx.user.click(button);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('could not sign out');

  expect(
    store.sessions.findFirst((query) => query.where({ sessionID: session.sessionID })),
  ).toMatchObject({ revokedAt: null });
});

test('it shows the registration form to a full session that holds no device', async () => {
  setupTest();

  await createFullSession();

  const rendered = render(<DevicePage />);

  const heading = await rendered.findByRole('heading', { name: 'Use this browser as a device' });

  expect(heading).toBeVisible();
  expect(rendered.queryByRole('heading', { name: 'Enrol this browser' })).toBeNull();
});

test('it registers the named device on the session it holds, then offers the screen switch', async () => {
  const ctx = setupTest();

  const session = await createFullSession();

  const rendered = render(<DevicePage />);

  const name = await rendered.findByLabelText('Device name');

  await ctx.user.clear(name);
  await ctx.user.type(name, 'kitchen tab');
  await ctx.user.click(rendered.getByRole('button', { name: 'Register device' }));

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  expect(button).toBeVisible();

  expect([
    deviceStore.hasDevice(session.sessionID),
    store.sessions.findFirst((query) => query.where({ sessionID: session.sessionID })),
  ]).toStrictEqual([true, expect.objectContaining({ revokedAt: null, token: session.token })]);
});

test('it says so when the registration fails', async () => {
  const ctx = setupTest();

  await createFullSession();

  server.use(http.post('*/rpc/devices/register', () => HttpResponse.error(), { once: true }));

  const rendered = render(<DevicePage />);

  const submit = await rendered.findByRole('button', { name: 'Register device' });

  await ctx.user.click(submit);

  const alert = await rendered.findByRole('alert');

  expect(alert).toHaveTextContent('Registration failed');
});

test('it leaves the screen off after a registration, even when the browser left it on before', async () => {
  const ctx = setupTest();

  await createFullSession();

  globalThis.localStorage.setItem('nixie.device.screen', 'on');

  const rendered = render(<DevicePage />);

  const submit = await rendered.findByRole('button', { name: 'Register device' });

  await ctx.user.click(submit);

  const button = await rendered.findByRole('button', { name: 'Switch on screen' });

  expect(button).toBeVisible();
  expect(rendered.queryByTestId('screen')).toBeNull();
});

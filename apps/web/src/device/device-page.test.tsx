import { expect, onTestFinished, test } from 'bun:test';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { server } from '../mocks/server';
import { store } from '../mocks/store';
import { createDeviceSession } from '../test-utils/create-device-session';
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

import { expect, test } from 'bun:test';
import { browserCookies } from '../mocks/browser-cookies';
import { store } from '../mocks/store';
import { createDeviceSession } from './create-device-session';

test('it creates a live session in the mock API', async () => {
  const session = await createDeviceSession();

  expect(store.sessions.findFirst((query) => query.where({ token: session.token }))).toMatchObject({
    revokedAt: null,
    sessionID: session.sessionID,
  });
});

test('it puts the session token in the browser cookie', async () => {
  const session = await createDeviceSession();

  expect(browserCookies.get('nixie_session')).toBe(session.token);
});

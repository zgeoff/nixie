import { expect, test } from 'bun:test';
import { browserCookies } from '../mocks/browser-cookies';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';
import { createFullSession } from './create-full-session';

test('it creates a live session with no device row', async () => {
  const session = await createFullSession();

  expect([
    store.sessions.findFirst((query) => query.where({ token: session.token }))?.revokedAt,
    deviceStore.hasDevice(session.sessionID),
  ]).toStrictEqual([null, false]);
});

test('it puts the session token in the browser cookie', async () => {
  const session = await createFullSession();

  expect(browserCookies.get('nixie_session')).toBe(session.token);
});

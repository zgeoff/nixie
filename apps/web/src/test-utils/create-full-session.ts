import { sessionCookieName } from '@heynixie/contract';
import { browserCookies } from '../mocks/browser-cookies';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';

// A signed-in session of the full scope that holds no device row, the way a browser that signed in
// before it opened device mode holds one.
export async function createFullSession() {
  const session = await store.sessions.create({});

  await deviceStore.sessionsWithoutDevice.create({ sessionID: session.sessionID });

  browserCookies.set(sessionCookieName, session.token);

  return session;
}

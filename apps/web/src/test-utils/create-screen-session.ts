import { sessionCookieName } from '@heynixie/contract';
import { browserCookies } from '../mocks/browser-cookies';
import { deviceStore } from '../mocks/device-store';
import { store } from '../mocks/store';

// A signed-in session of the device scope, the way a browser that enrolled with a device code
// holds one. It may call only the device procedures.
export async function createScreenSession() {
  const session = await store.sessions.create({});

  await deviceStore.screenSessions.create({ sessionID: session.sessionID });

  browserCookies.set(sessionCookieName, session.token);

  return session;
}

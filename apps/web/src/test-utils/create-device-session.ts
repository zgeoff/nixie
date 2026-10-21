import { sessionCookieName } from '@heynixie/contract';
import { browserCookies } from '../mocks/browser-cookies';
import { store } from '../mocks/store';

export async function createDeviceSession() {
  const session = await store.sessions.create({});

  browserCookies.set(sessionCookieName, session.token);

  return session;
}

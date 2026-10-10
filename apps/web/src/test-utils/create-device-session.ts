import { sessionCookieName } from '@heynixie/contract';
import { browserCookies } from '../mocks/browser-cookies';
import { store } from '../mocks/store';

// A device session of the tests' browser: the API holds the session, and the browser holds its
// token in the session cookie that enrolment would have set.
export async function createDeviceSession() {
  const session = await store.sessions.create({});

  browserCookies.set(sessionCookieName, session.token);

  return session;
}

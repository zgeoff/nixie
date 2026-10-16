import { store } from './store';

type StoredSession = NonNullable<ReturnType<typeof store.sessions.findFirst>>;

// Resolves the device session a call carries as nixie's API does, and throws the procedure's typed
// UNAUTHORIZED when the token names no live session.
export function requireMockSession(
  sessionToken: string | undefined,
  buildUnauthorized: () => Error,
): StoredSession {
  const session = store.sessions.findFirst((query) =>
    query.where({ revokedAt: null, token: sessionToken ?? '' }),
  );

  if (session === undefined) {
    throw buildUnauthorized();
  }

  return session;
}

import { store } from './store';

type StoredSession = NonNullable<ReturnType<typeof store.sessions.findFirst>>;

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

import { expect, test } from 'bun:test';
import { requireMockSession } from './require-mock-session';
import { store } from './store';

test('it resolves the live session the token names', async () => {
  const session = await store.sessions.create({ deviceName: 'phone' });

  expect(requireMockSession(session.token, () => new Error('signed out'))).toMatchObject({
    sessionID: session.sessionID,
  });
});

test('it refuses a revoked session', async () => {
  const session = await store.sessions.create({ deviceName: 'phone', revokedAt: new Date() });

  expect(() => requireMockSession(session.token, () => new Error('signed out'))).toThrow(
    'signed out',
  );
});

test('it refuses a call with no token', () => {
  expect(() => requireMockSession(undefined, () => new Error('signed out'))).toThrow('signed out');
});

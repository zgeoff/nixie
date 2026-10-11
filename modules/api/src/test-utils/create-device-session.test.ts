import { expect, test } from 'bun:test';
import { verifySessionToken } from '../verify-session-token';
import { createDeviceSession } from './create-device-session';
import { startTestAPI } from './start-test-api';

test('it creates a session whose token resolves to its row', async () => {
  const ctx = await startTestAPI();

  const session = await createDeviceSession(ctx.context, 'laptop');

  const result = await verifySessionToken(ctx.context, session.token);

  expect(result).toStrictEqual({
    identityID: session.sessionID,
    channel: 'client',
    label: 'laptop',
    pairedAt: 1_000_000,
    lastSeenAt: 1_000_000,
  });
});

test('it creates a separate session on each call', async () => {
  const ctx = await startTestAPI();

  const first = await createDeviceSession(ctx.context, 'laptop');
  const second = await createDeviceSession(ctx.context, 'laptop');

  expect(first.sessionID).not.toBe(second.sessionID);
});

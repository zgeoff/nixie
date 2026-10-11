import { expect, test } from 'bun:test';
import { readSessions } from './read-sessions';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { verifySessionToken } from './verify-session-token';
import { writeSessionRevocation } from './write-session-revocation';

async function setupTest() {
  const api = await startTestAPI();
  const session = await createDeviceSession(api.context, 'laptop');
  const caller = await verifySessionToken(api.context, session.token);

  if (caller === null) {
    throw new Error('the session failed to resolve');
  }
  return { ...api, caller };
}

test('it leaves out a revoked session', async () => {
  const ctx = await setupTest();

  const other = await createDeviceSession(ctx.context, 'phone');

  await writeSessionRevocation(ctx.context, ctx.caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: other.sessionID,
  });

  const sessions = await readSessions(ctx.context, ctx.caller);

  expect(sessions.map((session) => session.deviceName)).toStrictEqual(['laptop']);
});

test('it leaves out a lapsed session', async () => {
  const ctx = await setupTest();

  await createDeviceSession(ctx.context, 'phone');
  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const sessions = await readSessions(ctx.context, ctx.caller);

  expect(sessions).toStrictEqual([]);
});

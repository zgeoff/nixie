import { expect, test } from 'bun:test';
import { readSessions } from './read-sessions';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { writeSessionRevocation } from './write-session-revocation';

function setupTest() {
  return startTestAPI();
}

test('it leaves out a revoked session', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    sessionID: phone.sessionID,
  });

  const sessions = await readSessions(ctx.context, laptop.caller);

  expect(sessions.map((session) => session.deviceName)).toStrictEqual(['laptop']);
});

test('it leaves out a lapsed session', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await createDeviceSession(ctx.context, 'phone');
  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const sessions = await readSessions(ctx.context, laptop.caller);

  expect(sessions).toStrictEqual([]);
});

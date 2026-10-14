import { expect, test } from 'bun:test';
import { readKeptSessions } from './read-kept-sessions';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { writeSessionRevocation } from './write-session-revocation';

function setupTest() {
  return startTestAPI();
}

test('it reads each live session with its channel, label and paired time, oldest first', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(1);
  const phone = await createDeviceSession(ctx.context, 'phone');
  const kept = await readKeptSessions(ctx.writer.db, ctx.context);

  expect(kept).toStrictEqual([
    { identityID: laptop.sessionID, channel: 'client', label: 'laptop', pairedAt: 1_000_000 },
    { identityID: phone.sessionID, channel: 'client', label: 'phone', pairedAt: 1_000_001 },
  ]);
});

test('it leaves out a revoked session', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const phone = await createDeviceSession(ctx.context, 'phone');

  await writeSessionRevocation(ctx.context, laptop.caller, {
    clientActionID: '5c1e7a3b-2d4f-4b6a-8c9e-0f1a2b3c4d5e',
    sessionID: phone.sessionID,
  });

  const kept = await readKeptSessions(ctx.writer.db, ctx.context);

  expect(kept.map((session) => session.label)).toStrictEqual(['laptop']);
});

test('it leaves out a lapsed session', async () => {
  const ctx = await setupTest();

  await createDeviceSession(ctx.context, 'laptop');
  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const kept = await readKeptSessions(ctx.writer.db, ctx.context);

  expect(kept).toStrictEqual([]);
});

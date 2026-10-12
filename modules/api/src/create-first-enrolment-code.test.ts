import { expect, test } from 'bun:test';
import { createFirstEnrolmentCode } from './create-first-enrolment-code';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it issues a code while no device has a session', async () => {
  const ctx = await setupTest();

  const result = await createFirstEnrolmentCode(ctx.context);

  expect(result).toStrictEqual({
    code: expect.toBeString(),
    expiresAt: new Date(1_000_000 + 15 * 60 * 1000),
  });
});

test('it issues no code once a device has a live session', async () => {
  const ctx = await setupTest();

  await createDeviceSession(ctx.context, 'laptop');

  const result = await createFirstEnrolmentCode(ctx.context);

  expect(result).toBeNull();
});

test('it issues a code again once every session has lapsed', async () => {
  const ctx = await setupTest();

  await createDeviceSession(ctx.context, 'laptop');
  ctx.clock.advance(30 * 24 * 60 * 60 * 1000 + 1);

  const result = await createFirstEnrolmentCode(ctx.context);

  expect(result).not.toBeNull();
});

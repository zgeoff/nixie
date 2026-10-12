import { expect, test } from 'bun:test';
import { safe } from '@orpc/client';
import { buildTestClient } from './build-test-client';
import { createDeviceSession } from './create-device-session';
import { startTestAPI } from './start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it calls the API as the device whose session token it holds', async () => {
  const ctx = await setupTest();

  const laptop = await createDeviceSession(ctx.context, 'laptop');
  const listed = await buildTestClient(ctx.url, laptop.token).sessions.list();

  expect(listed.sessions).toMatchObject([{ sessionID: laptop.sessionID, current: true }]);
});

test('it calls the API signed out when it holds no token', async () => {
  const ctx = await setupTest();

  const result = await safe(buildTestClient(ctx.url).sessions.list());

  expect(result.error).toMatchObject({ code: 'UNAUTHORIZED', status: 401 });
});

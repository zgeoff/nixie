import { expect, test } from 'bun:test';
import { subscribeToRecords } from '@heynixie/log';
import { waitForCondition } from '@heynixie/testing';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';
import { watchSessionEnd } from './watch-session-end';

async function setupTest() {
  const api = await startTestAPI(defaultAPISettings);
  const owner = await createDeviceSession(api.context, 'laptop');
  const phone = await createDeviceSession(api.context, 'phone');

  const calls: string[] = [];

  return {
    ...api,
    calls,
    watchPhone: (subscribe: typeof subscribeToRecords) =>
      watchSessionEnd(
        api.context,
        phone.sessionID,
        {
          onEnd: () => {
            calls.push('end');
          },
          onRevokedUnheard: () => {
            calls.push('revoked-unheard');
          },
        },
        subscribe,
      ),
    revokePhone: () =>
      buildTestClient(api.url, owner.token).sessions.revoke({
        clientActionID: crypto.randomUUID(),
        sessionID: phone.sessionID,
      }),
  };
}

test('it ends what the session held when a later check finds it revoked and the subscription failed', async () => {
  const ctx = await setupTest();

  const pendingBefore = ctx.clock.countPending();

  await ctx.watchPhone(() => {
    throw new Error('the subscription failed');
  });

  // the first check finds the session live and then sleeps
  await waitForCondition(() => ctx.clock.countPending() > pendingBefore);

  await ctx.revokePhone();

  ctx.clock.advance(defaultAPISettings.lastSeenIntervalMs);

  await waitForCondition(() => ctx.calls.length === 2);

  expect(ctx.calls).toStrictEqual(['revoked-unheard', 'end']);
});

test('it leaves what the session held when the revocation record arrives through the subscription', async () => {
  const ctx = await setupTest();

  await ctx.watchPhone(subscribeToRecords);
  await ctx.revokePhone();

  await waitForCondition(() => ctx.calls.length === 1);

  expect(ctx.calls).toStrictEqual(['end']);
});

import { expect, onTestFinished, test } from 'bun:test';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { sessionHooks } from './session-hooks';

async function setupTest() {
  const calls: string[] = [];

  sessionHooks.set([
    {
      onEnrolled: (_tx, session) => {
        calls.push(`enrolled ${session.name} ${session.scope}`);

        return Promise.resolve();
      },
      onLabelled: (_tx, session) => {
        calls.push(`labelled ${session.label}`);

        return Promise.resolve();
      },
      onRevoked: () => {
        calls.push('revoked');

        return Promise.resolve();
      },
    },
  ]);

  onTestFinished(() => {
    sessionHooks.set([]);
  });

  const api = await startTestAPI();
  const owner = await createDeviceSession(api.context, 'laptop');

  return { api, calls, client: buildTestClient(api.url, owner.token) };
}

test('#sessionHooks runs the enrol hook of a feature for a session that enrols', async () => {
  const ctx = await setupTest();
  const issued = await ctx.client.sessions.issueCode({ clientActionID: crypto.randomUUID() });

  await buildTestClient(ctx.api.url).sessions.enrol({
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName: 'tablet',
    tokenDelivery: 'bearer',
  });

  expect(ctx.calls.filter((entry) => entry.startsWith('enrolled tablet'))).toStrictEqual([
    'enrolled tablet full',
  ]);
});

test('#sessionHooks runs the revoke hook of a feature for a session that the owner revokes', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.api.context, 'phone');

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  expect(ctx.calls).toContain('revoked');
});

test('#sessionHooks runs no hook when none is set', async () => {
  const ctx = await setupTest();

  sessionHooks.set([]);

  const other = await createDeviceSession(ctx.api.context, 'phone');

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  expect(ctx.calls).not.toContain('revoked');
});

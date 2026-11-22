import { expect, test } from 'bun:test';
import { clientHeaderName } from '@heynixie/contract';
import invariant from 'tiny-invariant';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import type { APITables } from '../types';
import { defaultAPISettings } from '../utils/default-api-settings';
import { deriveSecretHash } from '../utils/derive-secret-hash';

async function setupTest() {
  const readOnlyToken = Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('hex');

  const api = await startTestAPI({
    ...defaultAPISettings,
    readOnlyTokenHashes: [deriveSecretHash(readOnlyToken)],
  });

  api.setWatch(() => ({ receive: () => {}, end: () => {} }));

  const owner = await createDeviceSession(api.context, 'laptop');

  const enrolScreen = async () => {
    const issued = await buildTestClient(api.url, owner.token).sessions.issueCode({
      clientActionID: crypto.randomUUID(),
      scope: 'device',
    });

    const enrolled = await buildTestClient(api.url).sessions.enrol({
      clientActionID: crypto.randomUUID(),
      code: issued.code,
      deviceName: 'wall panel',
      tokenDelivery: 'bearer',
    });

    invariant(enrolled.token !== undefined, 'a bearer enrolment returns its token');

    return enrolled.token;
  };

  return {
    ...api,
    owner,
    readOnlyToken,
    enrolScreen,
    client: buildTestClient(api.url, owner.token, 'https://nixie.test'),
    readStoredActions: () =>
      api.writer.db.$extendTables<APITables>().selectFrom('client_actions').selectAll().execute(),
  };
}

test('#computer.watch gives a signed-in session a path on the API origin', async () => {
  const ctx = await setupTest();
  const watch = await ctx.client.computer.watch({ clientActionID: crypto.randomUUID() });

  expect(watch.streamURL).toMatch(/^\/rpc\/computer\/watch-stream\?ticket=[\w-]{43}$/u);
});

test('#computer.watch ignores the origin the caller names', async () => {
  const ctx = await setupTest();

  const watch = await buildTestClient(
    ctx.url,
    ctx.owner.token,
    'https://example.invalid',
  ).computer.watch({ clientActionID: crypto.randomUUID() });

  expect(watch.streamURL).toMatch(/^\/rpc\/computer\/watch-stream\?ticket=[\w-]{43}$/u);
});

test('#computer.watch mints a fresh ticket for a retry of the same action', async () => {
  const ctx = await setupTest();

  const clientActionID = crypto.randomUUID();

  const first = await ctx.client.computer.watch({ clientActionID });
  const retry = await ctx.client.computer.watch({ clientActionID });

  expect(retry.streamURL).not.toBe(first.streamURL);
});

test('#computer.watch keeps no ticket and no URL in the stored action', async () => {
  const ctx = await setupTest();
  const watch = await ctx.client.computer.watch({ clientActionID: crypto.randomUUID() });

  const ticket = watch.streamURL.split('ticket=')[1] ?? '';

  const rows = await ctx.readStoredActions();

  const stored = JSON.stringify(rows);

  expect([
    stored.includes(ticket),
    stored.includes('streamURL'),
    stored.includes('minted'),
  ]).toStrictEqual([false, false, true]);
});

test('#computer.watch refuses an action ID that another session used', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');

  const clientActionID = crypto.randomUUID();

  await ctx.client.computer.watch({ clientActionID });

  const reused = buildTestClient(ctx.url, other.token).computer.watch({ clientActionID });

  await Promise.allSettled([reused]);

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#computer.watch refuses a call with no session', async () => {
  const ctx = await setupTest();

  const refused = buildTestClient(ctx.url).computer.watch({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#computer.watch refuses a read-only token before any procedure runs', async () => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/computer/watch`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'verify',
      'content-type': 'application/json',
      authorization: `Bearer ${ctx.readOnlyToken}`,
    },
    body: JSON.stringify({ json: { clientActionID: crypto.randomUUID() } }),
  });

  expect(response.status).toBe(403);
});

test('#computer.watch refuses the session of a wall panel before any procedure runs', async () => {
  const ctx = await setupTest();
  const screenToken = await ctx.enrolScreen();

  const response = await fetch(`${ctx.url}/rpc/computer/watch`, {
    method: 'POST',
    headers: {
      [clientHeaderName]: 'web',
      'content-type': 'application/json',
      authorization: `Bearer ${screenToken}`,
    },
    body: JSON.stringify({ json: { clientActionID: crypto.randomUUID() } }),
  });

  expect(response.status).toBe(403);
});

test('#computer.watch refuses a revoked session', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  const refused = buildTestClient(ctx.url, other.token).computer.watch({
    clientActionID: crypto.randomUUID(),
  });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#computer.watch says the computer is unavailable before it starts', async () => {
  const ctx = await setupTest();

  ctx.setWatch(null);

  const refused = ctx.client.computer.watch({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'COMPUTER_UNAVAILABLE' });
});

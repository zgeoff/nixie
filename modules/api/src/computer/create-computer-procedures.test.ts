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

  api.setWatch(() => ({
    receive: () => {},
    releaseInput: () => {},
    closeAfterRelease: () => {},
    end: () => {},
  }));

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

test('#computer.takeOver takes over for the calling session and returns when it started', async () => {
  const ctx = await setupTest();

  const started: string[] = [];

  ctx.setTakeover({
    start: (deviceID) => {
      started.push(deviceID);

      return Promise.resolve({ kind: 'started', takenOverAt: 1_700_000_000_000 });
    },
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const result = await ctx.client.computer.takeOver({ clientActionID: crypto.randomUUID() });

  expect([result, started]).toStrictEqual([
    { takenOverAt: 1_700_000_000_000 },
    [ctx.owner.sessionID],
  ]);
});

test.each([
  { kind: 'busy_too_long', code: 'BUSY_TOO_LONG' },
  { kind: 'held_elsewhere', code: 'HELD_ELSEWHERE' },
] as const)('#computer.takeOver answers $code when the hold says $kind', async (row) => {
  const ctx = await setupTest();

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: row.kind }),
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const refused = ctx.client.computer.takeOver({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: row.code });
});

test('#computer.takeOver gives a retry of the same action the answer of the first try', async () => {
  const ctx = await setupTest();

  const calls = { count: 0 };

  ctx.setTakeover({
    start: () => {
      calls.count += 1;

      return Promise.resolve({ kind: 'started', takenOverAt: 1_700_000_000_000 });
    },
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const clientActionID = crypto.randomUUID();

  await ctx.client.computer.takeOver({ clientActionID });

  const retry = await ctx.client.computer.takeOver({ clientActionID });

  expect([retry, calls.count]).toStrictEqual([{ takenOverAt: 1_700_000_000_000 }, 1]);
});

test('#computer.takeOver answers a retry of a refused action with the same refusal', async () => {
  const ctx = await setupTest();

  const calls = { count: 0 };

  ctx.setTakeover({
    start: () => {
      calls.count += 1;

      const answer =
        calls.count === 1
          ? { kind: 'busy_too_long' as const }
          : { kind: 'started' as const, takenOverAt: 1 };

      return Promise.resolve(answer);
    },
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const clientActionID = crypto.randomUUID();
  const first = ctx.client.computer.takeOver({ clientActionID });

  await Promise.allSettled([first]);

  const retry = ctx.client.computer.takeOver({ clientActionID });

  await Promise.allSettled([retry]);

  expect(retry).rejects.toMatchObject({ code: 'BUSY_TOO_LONG' });
  expect(calls.count).toBe(1);
});

test('#computer.takeOver refuses an action ID that another session used', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const clientActionID = crypto.randomUUID();

  await ctx.client.computer.takeOver({ clientActionID });

  const reused = buildTestClient(ctx.url, other.token).computer.takeOver({ clientActionID });

  await Promise.allSettled([reused]);

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#computer.takeOver refuses a revoked session before it takes anything', async () => {
  const ctx = await setupTest();
  const other = await createDeviceSession(ctx.context, 'phone');

  const started: string[] = [];

  ctx.setTakeover({
    start: (deviceID) => {
      started.push(deviceID);

      return Promise.resolve({ kind: 'started', takenOverAt: 1 });
    },
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  await ctx.client.sessions.revoke({
    clientActionID: crypto.randomUUID(),
    sessionID: other.sessionID,
  });

  const refused = buildTestClient(ctx.url, other.token).computer.takeOver({
    clientActionID: crypto.randomUUID(),
  });

  await Promise.allSettled([refused]);

  expect(started).toStrictEqual([]);
  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#computer.takeOver refuses a read-only token before any procedure runs', async () => {
  const ctx = await setupTest();

  const response = await fetch(`${ctx.url}/rpc/computer/takeOver`, {
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

test('#computer.takeOver refuses the session of a wall panel before any procedure runs', async () => {
  const ctx = await setupTest();
  const screenToken = await ctx.enrolScreen();

  const response = await fetch(`${ctx.url}/rpc/computer/takeOver`, {
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

test('#computer.takeOver says the computer is unavailable before it starts', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.computer.takeOver({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'COMPUTER_UNAVAILABLE' });
});

test('#computer.handBack ends the hold of the calling session and returns how long it lasted', async () => {
  const ctx = await setupTest();

  const ended: [string, string | undefined][] = [];

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: (by, deviceID) => {
      ended.push([by, deviceID]);

      return Promise.resolve({ kind: 'ended', durationSeconds: 63 });
    },
  });

  const result = await ctx.client.computer.handBack({ clientActionID: crypto.randomUUID() });

  expect([result, ended]).toStrictEqual([{ durationSeconds: 63 }, [['user', ctx.owner.sessionID]]]);
});

test('#computer.handBack answers NOT_TAKEN_OVER when this session does not hold the desktop', async () => {
  const ctx = await setupTest();

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: () => Promise.resolve({ kind: 'not_taken_over' }),
  });

  const refused = ctx.client.computer.handBack({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'NOT_TAKEN_OVER' });
});

test('#computer.handBack gives a retry of the same action the answer of the first try', async () => {
  const ctx = await setupTest();

  const calls = { count: 0 };

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: () => {
      calls.count += 1;

      return Promise.resolve({ kind: 'ended', durationSeconds: 63 });
    },
  });

  const clientActionID = crypto.randomUUID();

  await ctx.client.computer.handBack({ clientActionID });

  const retry = await ctx.client.computer.handBack({ clientActionID });

  expect([retry, calls.count]).toStrictEqual([{ durationSeconds: 63 }, 1]);
});

test('#computer.handBack gives two overlapping tries of one action the same answer', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<void>();
  const calls = { count: 0 };

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: async () => {
      calls.count += 1;

      await gate.promise;

      return calls.count === 1
        ? { kind: 'ended', durationSeconds: 63 }
        : { kind: 'not_taken_over' };
    },
  });

  const clientActionID = crypto.randomUUID();
  const first = ctx.client.computer.handBack({ clientActionID });
  const second = ctx.client.computer.handBack({ clientActionID });

  gate.resolve();

  const results = await Promise.all([first, second]);

  expect([results, calls.count]).toStrictEqual([
    [{ durationSeconds: 63 }, { durationSeconds: 63 }],
    1,
  ]);
});

test('#computer.handBack answers a retry of a refused action with the same refusal', async () => {
  const ctx = await setupTest();

  const calls = { count: 0 };

  ctx.setTakeover({
    start: () => Promise.resolve({ kind: 'started', takenOverAt: 1 }),
    end: () => {
      calls.count += 1;

      const answer =
        calls.count === 1
          ? { kind: 'not_taken_over' as const }
          : { kind: 'ended' as const, durationSeconds: 63 };

      return Promise.resolve(answer);
    },
  });

  const clientActionID = crypto.randomUUID();
  const first = ctx.client.computer.handBack({ clientActionID });

  await Promise.allSettled([first]);

  const retry = ctx.client.computer.handBack({ clientActionID });

  await Promise.allSettled([retry]);

  expect(retry).rejects.toMatchObject({ code: 'NOT_TAKEN_OVER' });
  expect(calls.count).toBe(1);
});

test('#computer.handBack says the computer is unavailable before it starts', async () => {
  const ctx = await setupTest();

  const refused = ctx.client.computer.handBack({ clientActionID: crypto.randomUUID() });

  await Promise.allSettled([refused]);

  expect(refused).rejects.toMatchObject({ code: 'COMPUTER_UNAVAILABLE' });
});

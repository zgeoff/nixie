import { expect, test } from 'bun:test';
import type { ConnectionsPort } from '@heynixie/connections';
import { withWriteTransaction } from '@heynixie/log';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const calls: (readonly unknown[])[] = [];

  const state: {
    registered: 'registered' | 'invalid_origin' | 'client_exists';
    started: 'started' | 'client_missing' | 'connection_not_found';
    finished: Awaited<ReturnType<ConnectionsPort['finishConsent']>>;
    removed: 'ok' | 'client_not_found' | 'client_in_use';

    // the expiry of a consent that a retry began again, when it is not the first one's
    retryExpiresAt: number | null;

    // a registration whose outcome committed and whose process then ended
    isCrashAfterRegistration: boolean;
  } = {
    registered: 'registered',
    started: 'started',
    finished: { kind: 'consent_not_found' },
    removed: 'ok',
    retryExpiresAt: null,
    isCrashAfterRegistration: false,
  };

  const forgetState = {
    erasure: 'pending',
    revocation: 'confirmed',
    finishedSequence: null,
  } as const;

  const port: ConnectionsPort = {
    readSetup: (pageOrigin) => {
      calls.push(['readSetup', pageOrigin]);

      return Promise.resolve({
        steps: [{ id: 'project', title: 'Project', body: 'Make one', links: [] }],
        client: null,
      });
    },
    registerClient: async (input, attempt) => {
      calls.push(['registerClient', input]);

      const result: Awaited<ReturnType<ConnectionsPort['registerClient']>> =
        state.registered === 'registered'
          ? { kind: 'registered', client: 'q7m2x9k4ta', redirectURI: `${input.origin}/return` }
          : { kind: state.registered };

      if (state.isCrashAfterRegistration) {
        await withWriteTransaction(api.context.log.writer, async (tx) => {
          await attempt?.settle(tx, result);
        });

        throw new Error('the process ended after the registration committed');
      }

      return result;
    },
    setPicker: (client, picker) => {
      calls.push(['setPicker', client, picker]);

      const kind = client === 'q7m2x9k4ta' ? 'ok' : 'client_not_found';

      return Promise.resolve({ kind });
    },
    removeClient: (client) => {
      calls.push(['removeClient', client]);

      return Promise.resolve({ kind: state.removed });
    },
    startConsent: (input) => {
      calls.push(['startConsent', input]);

      const result: Awaited<ReturnType<ConnectionsPort['startConsent']>> =
        state.started === 'started'
          ? {
              kind: 'started',
              consentID: input.consentID ?? 'consent-1',
              consentURL: `https://accounts.example/authorize?state=s${calls.length}`,
              expiresAt:
                input.consentID === undefined
                  ? 1_800_000_000_000
                  : (state.retryExpiresAt ?? 1_800_000_000_000),
            }
          : { kind: state.started };

      return Promise.resolve(result);
    },
    finishConsent: (input) => {
      calls.push(['finishConsent', input]);

      return Promise.resolve(state.finished);
    },
    list: () =>
      Promise.resolve([
        {
          connection: 'k3x9m2p7qa',
          connector: 'google',
          label: 'work',
          account: 'robin.vale@example.com',
          status: 'active',
          reason: null,
          statusSince: 1_700_000_000_000,
          lastSuccessAt: null,
          scopes: ['gmail.modify'],
          missing: [],
          fingerprint: 'abcd1234',
          forget: null,
        },
      ]),
    forgetConnection: (connection) => {
      calls.push(['forgetConnection', connection]);

      const result: Awaited<ReturnType<ConnectionsPort['forgetConnection']>> =
        connection === 'k3x9m2p7qa'
          ? { kind: 'forgotten', connectionID: 'c1', state: forgetState }
          : { kind: 'connection_not_found' };

      return Promise.resolve(result);
    },
    readForgetState: (connection) => {
      const read = connection === 'k3x9m2p7qa' ? { connection, state: forgetState } : null;

      return Promise.resolve(read);
    },
  };

  return {
    ...api,
    origin,
    port,
    calls,
    state,
    client: buildTestClient(api.url, laptop.token, origin),
  };
}

test('#connections.readSetup passes the origin of the page to the steps', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const setup = await ctx.client.connections.readSetup({
    connector: 'google',
    origin: 'https://page.example.org',
  });

  expect([setup, ctx.calls]).toStrictEqual([
    {
      steps: [{ id: 'project', title: 'Project', body: 'Make one', links: [] }],
      client: null,
    },
    [['readSetup', 'https://page.example.org']],
  ]);
});

test('#connections.registerClient passes the Origin header of the call beside the origin it registers', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const registered = await ctx.client.connections.registerClient({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  expect([registered, ctx.calls]).toStrictEqual([
    { client: 'q7m2x9k4ta', redirectURI: `${ctx.origin}/return` },
    [
      [
        'registerClient',
        {
          clientID: 'client-1.apps.example',
          clientSecret: 'secret-value-1',
          origin: ctx.origin,
          headerOrigin: ctx.origin,
          pickerKey: null,
          projectNumber: null,
        },
      ],
    ],
  ]);
});

test('#connections.registerClient answers a retry with the first result, and keeps no hash of the secret', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  await ctx.client.connections.registerClient({
    clientActionID,
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  const retried = await ctx.client.connections.registerClient({
    clientActionID,
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-2',
    origin: ctx.origin,
  });

  expect([retried, ctx.calls.length]).toStrictEqual([
    { client: 'q7m2x9k4ta', redirectURI: `${ctx.origin}/return` },
    1,
  ]);
});

test('#connections.registerClient refuses an action ID that another input used', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  await ctx.client.connections.registerClient({
    clientActionID,
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  const reused = ctx.client.connections.registerClient({
    clientActionID,
    connector: 'google',
    clientID: 'client-2.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  await reused.catch(() => {});

  expect(reused).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test.each([
  { title: 'an origin that fails its checks', kind: 'invalid_origin', code: 'INVALID_ORIGIN' },
  { title: 'a client that exists', kind: 'client_exists', code: 'CLIENT_EXISTS' },
] as const)('#connections.registerClient refuses $title', async (row) => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.registered = row.kind;

  const refused = ctx.client.connections.registerClient({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: row.code });
});

test('#connections.setPicker sets both values, and refuses a client that is not registered', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  await ctx.client.connections.setPicker({
    clientActionID: crypto.randomUUID(),
    client: 'q7m2x9k4ta',
    pickerKey: 'AIzaKey',
    projectNumber: '123456789012',
  });

  const missing = ctx.client.connections.setPicker({
    clientActionID: crypto.randomUUID(),
    client: 'zzzzzzzzzz',
    pickerKey: null,
    projectNumber: null,
  });

  await missing.catch(() => {});

  expect(missing).rejects.toMatchObject({ code: 'CLIENT_NOT_FOUND' });

  expect(ctx.calls[0]).toStrictEqual([
    'setPicker',
    'q7m2x9k4ta',
    { pickerKey: 'AIzaKey', projectNumber: '123456789012' },
  ]);
});

test('#connections.setPicker answers a retry with the first result, so an older change never overwrites a newer one', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  await ctx.client.connections.setPicker({
    clientActionID,
    client: 'q7m2x9k4ta',
    pickerKey: 'AIzaOld',
    projectNumber: '111111111111',
  });

  await ctx.client.connections.setPicker({
    clientActionID: crypto.randomUUID(),
    client: 'q7m2x9k4ta',
    pickerKey: 'AIzaNew',
    projectNumber: '222222222222',
  });

  const retried = await ctx.client.connections.setPicker({
    clientActionID,
    client: 'q7m2x9k4ta',
    pickerKey: 'AIzaOld',
    projectNumber: '111111111111',
  });

  expect([retried, ctx.calls.length]).toStrictEqual([{}, 2]);
});

test('#connections.removeClient answers a retry of a removal with the first result', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  await ctx.client.connections.removeClient({ clientActionID, client: 'q7m2x9k4ta' });

  ctx.state.removed = 'client_not_found';

  const retried = await ctx.client.connections.removeClient({
    clientActionID,
    client: 'q7m2x9k4ta',
  });

  expect([retried, ctx.calls.length]).toStrictEqual([{}, 1]);
});

test('#connections.registerClient answers a retry of a registration whose process ended after it committed', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.isCrashAfterRegistration = true;

  const request = {
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  } as const;

  const first = ctx.client.connections.registerClient(request);

  await first.catch(() => {});

  ctx.state.registered = 'client_exists';
  ctx.state.isCrashAfterRegistration = false;

  const retried = await ctx.client.connections.registerClient(request);

  expect([retried, ctx.calls.length]).toStrictEqual([
    { client: 'q7m2x9k4ta', redirectURI: `${ctx.origin}/return` },
    1,
  ]);
});

test('#connections.setPicker refuses one value without the other', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const refused = ctx.client.connections.setPicker({
    clientActionID: crypto.randomUUID(),
    client: 'q7m2x9k4ta',
    pickerKey: 'AIzaKey',
    projectNumber: null,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toBeDefined();
  expect(ctx.calls).toStrictEqual([]);
});

test('#connections.removeClient refuses a client that a connection or a consent uses', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.removed = 'client_in_use';

  const refused = ctx.client.connections.removeClient({
    clientActionID: crypto.randomUUID(),
    client: 'q7m2x9k4ta',
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'CLIENT_IN_USE' });
});

test('#connections.startConsent answers the consent URL of the device session that asked', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const started = await ctx.client.connections.startConsent({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    connection: null,
  });

  expect([
    started.consentURL.startsWith('https://accounts.example/authorize?state='),
    started.expiresAt,
  ]).toStrictEqual([true, new Date(1_800_000_000_000)]);
});

test('#connections.startConsent answers a retry with the expiry of the request that began again', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  await ctx.client.connections.startConsent({
    clientActionID,
    connector: 'google',
    connection: null,
  });

  ctx.state.retryExpiresAt = 1_800_000_600_000;

  const retried = await ctx.client.connections.startConsent({
    clientActionID,
    connector: 'google',
    connection: null,
  });

  expect(retried.expiresAt).toStrictEqual(new Date(1_800_000_600_000));
});

test('#connections.startConsent gives a retry a fresh consent URL of the same consent', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  const first = await ctx.client.connections.startConsent({
    clientActionID,
    connector: 'google',
    connection: null,
  });

  const retried = await ctx.client.connections.startConsent({
    clientActionID,
    connector: 'google',
    connection: null,
  });

  expect([
    retried.consentURL === first.consentURL,
    retried.expiresAt,
    ctx.calls.map((call) => call[0]),
    ctx.calls[1],
  ]).toStrictEqual([
    false,
    first.expiresAt,
    ['startConsent', 'startConsent'],
    [
      'startConsent',
      expect.objectContaining({ consentID: 'consent-1', deviceSessionID: expect.any(String) }),
    ],
  ]);
});

test.each([
  { title: 'no registered client', kind: 'client_missing', code: 'CLIENT_MISSING' },
  { title: 'an unknown connection', kind: 'connection_not_found', code: 'CONNECTION_NOT_FOUND' },
] as const)('#connections.startConsent refuses $title', async (row) => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.started = row.kind;

  const refused = ctx.client.connections.startConsent({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    connection: null,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: row.code });
});

test('#connections.finishConsent answers the connection and what is missing', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.finished = {
    kind: 'finished',
    connection: 'k3x9m2p7qa',
    missing: [{ scope: 'drive.file', reason: 'not_granted' }],
  };

  const finished = await ctx.client.connections.finishConsent({
    state: 's1',
    code: 'c1',
    error: null,
  });

  expect(finished).toStrictEqual({
    connection: 'k3x9m2p7qa',
    missing: [{ scope: 'drive.file', reason: 'not_granted' }],
  });
});

test.each([
  { kind: 'consent_not_found', code: 'CONSENT_NOT_FOUND' },
  { kind: 'consent_refused', code: 'CONSENT_REFUSED' },
  { kind: 'no_refresh_token', code: 'NO_REFRESH_TOKEN' },
  { kind: 'account_mismatch', code: 'ACCOUNT_MISMATCH' },
  { kind: 'forget_in_progress', code: 'FORGET_IN_PROGRESS' },
] as const)('#connections.finishConsent answers $code for a $kind result', async (row) => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.finished = { kind: row.kind };

  const refused = ctx.client.connections.finishConsent({ state: 's1', code: 'c1', error: null });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: row.code });
});

test('#connections.finishConsent carries the error code of Google in a failed exchange', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  ctx.state.finished = { kind: 'token_exchange_failed', googleError: 'invalid_grant' };

  const refused = ctx.client.connections.finishConsent({ state: 's1', code: 'c1', error: null });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({
    code: 'TOKEN_EXCHANGE_FAILED',
    data: { googleError: 'invalid_grant' },
  });
});

test('#connections.list answers each connection with its dates', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const listed = await ctx.client.connections.list();

  expect(listed).toStrictEqual([
    {
      connection: 'k3x9m2p7qa',
      connector: 'google',
      label: 'work',
      account: 'robin.vale@example.com',
      status: 'active',
      reason: null,
      statusSince: new Date(1_700_000_000_000),
      lastSuccessAt: null,
      scopes: ['gmail.modify'],
      missing: [],
      fingerprint: 'abcd1234',
      forget: null,
    },
  ]);
});

test('#connections.forget answers erasure, revocation and backup apart, and a retry reads where the forget stands', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const clientActionID = crypto.randomUUID();

  const forgotten = await ctx.client.connections.forget({
    clientActionID,
    connection: 'k3x9m2p7qa',
  });

  const retried = await ctx.client.connections.forget({ clientActionID, connection: 'k3x9m2p7qa' });

  expect([
    forgotten,
    retried,
    ctx.calls.filter((call) => call[0] === 'forgetConnection').length,
  ]).toStrictEqual([
    { erasure: 'pending', revocation: 'confirmed', backup: { state: 'pending' } },
    { erasure: 'pending', revocation: 'confirmed', backup: { state: 'pending' } },
    1,
  ]);
});

test('#connections.forget refuses a connection that is unknown', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const refused = ctx.client.connections.forget({
    clientActionID: crypto.randomUUID(),
    connection: 'zzzzzzzzzz',
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'CONNECTION_NOT_FOUND' });
});

test('#connections.readForgetStatus answers the state of each forget it names', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const read = await ctx.client.connections.readForgetStatus({ connections: ['k3x9m2p7qa'] });

  expect(read).toStrictEqual([
    {
      connection: 'k3x9m2p7qa',
      erasure: 'pending',
      revocation: 'confirmed',
      backup: { state: 'pending' },
    },
  ]);
});

test('#connections.list refuses until the connections start', async () => {
  const ctx = await setupTest();

  const listed = ctx.client.connections.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'CONNECTIONS_NOT_STARTED' });
});

test('#connections.list refuses a caller with no session', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const listed = buildTestClient(ctx.url).connections.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#connections.registerClient refuses a caller with no session before it reads the port', async () => {
  const ctx = await setupTest();

  ctx.setConnections(ctx.port);

  const refused = buildTestClient(ctx.url).connections.registerClient({
    clientActionID: crypto.randomUUID(),
    connector: 'google',
    clientID: 'client-1.apps.example',
    clientSecret: 'secret-value-1',
    origin: ctx.origin,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

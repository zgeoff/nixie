import { expect, test } from 'bun:test';
import { startConnectionsHarness } from '../test-utils/start-connections-harness';

async function setupTest() {
  const origin = 'https://nixie.example.org';

  const harness = await startConnectionsHarness();

  const register = (input: { origin?: string; headerOrigin?: string | undefined } = {}) =>
    harness.connections.registerClient({
      clientID: 'client-123.apps.test',
      clientSecret: 'fake-client-secret-value',
      origin: input.origin ?? origin,
      headerOrigin: 'headerOrigin' in input ? input.headerOrigin : origin,
      pickerKey: 'AIzaKey',
      projectNumber: '123456789012',
    });

  return { ...harness, register, origin };
}

test('it registers a client and answers its short ID and the redirect URI of its origin', async () => {
  const ctx = await setupTest();
  const result = await ctx.register();

  expect(result).toStrictEqual({
    kind: 'registered',
    client: expect.stringMatching(/^[a-z0-9]{10}$/u),
    redirectURI: 'https://nixie.example.org/connections/google/return',
  });
});

test('it seals the secret and keeps the public values in the row', async () => {
  const ctx = await setupTest();
  const result = await ctx.register();
  const setup = await ctx.connections.readSetup(ctx.origin);
  const [clientID] = await ctx.readClientIDs();
  const row = await ctx.readClientRow(clientID ?? '');

  expect([
    result.kind,
    setup.client,
    Buffer.from(row?.secret_sealed ?? []).includes('fake-client-secret-value'),
  ]).toStrictEqual([
    'registered',
    {
      client: expect.any(String),
      origin: ctx.origin,
      redirectURI: 'https://nixie.example.org/connections/google/return',
      fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u),
      pickerKey: 'AIzaKey',
      projectNumber: '123456789012',
    },
    false,
  ]);
});

test.each([
  {
    title: 'an http origin',
    origin: 'http://nixie.example.org',
    header: 'http://nixie.example.org',
  },
  {
    title: 'an origin with a path',
    origin: 'https://nixie.example.org/settings',
    header: 'https://nixie.example.org',
  },
  {
    title: 'an origin that differs from the Origin header',
    origin: 'https://nixie.example.org',
    header: 'https://other.example.org',
  },
  { title: 'a call with no Origin header', origin: 'https://nixie.example.org', header: undefined },
])('it refuses $title', async (row) => {
  const ctx = await setupTest();
  const result = await ctx.register({ origin: row.origin, headerOrigin: row.header });

  expect(result).toStrictEqual({ kind: 'invalid_origin' });
});

test('it refuses a second client while the first is not removed', async () => {
  const ctx = await setupTest();

  await ctx.register();

  const second = await ctx.register();

  expect(second).toStrictEqual({ kind: 'client_exists' });
});

test('it writes a record that holds the fingerprint and never the secret', async () => {
  const ctx = await setupTest();

  await ctx.register();

  const records = await ctx.readRecordPayloads('connection.client_registered');

  expect(JSON.stringify(records)).not.toContain('fake-client-secret-value');

  expect(records).toStrictEqual([
    { client: expect.any(String), fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u) },
  ]);
});

test('it saves the registration and the step that stores its outcome in one transaction', async () => {
  const ctx = await setupTest();

  const settled = ctx.connections.registerClient(
    {
      clientID: 'client-123.apps.test',
      clientSecret: 'fake-client-secret-value',
      origin: ctx.origin,
      headerOrigin: ctx.origin,
      pickerKey: null,
      projectNumber: null,
    },
    { isRetry: false, settle: () => Promise.reject(new Error('the outcome could not be stored')) },
  );

  await Promise.allSettled([settled]);

  const setup = await ctx.connections.readSetup(ctx.origin);

  expect(setup.client).toBeNull();
});

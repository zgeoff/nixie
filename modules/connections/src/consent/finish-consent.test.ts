import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { connectedCodec } from '../record/connected-codec';
import { consentDiscardedCodec } from '../record/consent-discarded-codec';
import {
  googleClientID,
  googleScopes,
  startGoogleConnections,
} from '../test-utils/start-google-connections';
import { buildPKCEChallenge } from './build-pkce-challenge';

async function setupTest() {
  const ctx = await startGoogleConnections();

  const readKinds = async () => {
    const records = await readRecords(ctx.log, { afterSequence: 0 });

    return records.map((entry) => entry.record);
  };

  return { ...ctx, readKinds };
}

test('it completes a consent against Google, with the account from the ID token', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');
  const result = await ctx.finish('session-a', started.state);
  const listed = await ctx.connections.list();

  expect(result).toStrictEqual({
    kind: 'finished',
    connection: expect.any(String),
    missing: [],
  });

  expect(listed).toStrictEqual([
    {
      connection: expect.stringMatching(/^[a-z0-9]{10}$/u),
      connector: 'google',
      label: 'work@example.test',
      account: 'work@example.test',
      status: 'active',
      reason: null,
      statusSince: ctx.clock.now(),
      lastSuccessAt: ctx.clock.now(),
      scopes: [...googleScopes],
      missing: [],
      fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u),
      forget: null,
    },
  ]);
});

test('it sends the code, the verifier of the consent URL, the secret and the registered redirect URI', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');

  await ctx.finish('session-a', started.state);

  const [request] = ctx.google.codeRequests;

  expect(request).toMatchObject({
    grant_type: 'authorization_code',
    code: 'code-work',
    client_id: googleClientID,
    client_secret: 'fake-client-secret-value',
    redirect_uri: 'https://nixie.example.org/connections/google/return',
  });

  expect(buildPKCEChallenge(request?.['code_verifier'] ?? '')).toBe(started.challenge);
});

test('it reads each scope once after a consent, with the access token', async () => {
  const ctx = await setupTest();

  await ctx.connect('code-work');

  const reads = ctx.provider.requests.filter((request) => request.path !== '/token');

  expect(reads.map((request) => [request.path, request.authorization])).toStrictEqual([
    ['/gmail/v1/users/me/labels', 'Bearer google-access-1'],
    ['/calendar/v3/calendars/primary/events', 'Bearer google-access-1'],
    ['/calendar/v3/users/me/calendarList', 'Bearer google-access-1'],
    ['/drive/v3/files', 'Bearer google-access-1'],
  ]);
});

test('it refuses a state that another device session started, and lets the right one finish', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');
  const other = await ctx.finish('session-b', started.state);
  const own = await ctx.finish('session-a', started.state);

  expect([other, own.kind]).toStrictEqual([{ kind: 'consent_not_found' }, 'finished']);
});

test('it works once for a state', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');

  await ctx.finish('session-a', started.state);

  const again = await ctx.finish('session-a', started.state);
  const listed = await ctx.connections.list();

  expect([again, listed]).toStrictEqual([{ kind: 'consent_not_found' }, [expect.anything()]]);
});

test('it refuses a state after the request lapsed, and sends no code', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');

  ctx.clock.advance(started.expiresAt - ctx.clock.now() + 1);

  const result = await ctx.finish('session-a', started.state);

  expect([result, ctx.google.codeRequests]).toStrictEqual([{ kind: 'consent_not_found' }, []]);
});

test('it keeps nothing and revokes the access token for a token response with no refresh token', async () => {
  const ctx = await setupTest();
  const before = await ctx.countKeys();

  ctx.google.accounts.set('code-work', {
    sub: 'sub-work',
    email: 'work@example.test',
    scopes: googleScopes,
    hasRefreshToken: false,
  });

  const result = await ctx.connect('code-work');
  const listed = await ctx.connections.list();
  const after = await ctx.countKeys();

  expect([result, listed, after, ctx.countRequests('/revoke')]).toStrictEqual([
    { kind: 'no_refresh_token' },
    [],
    before,
    1,
  ]);
});

test('it answers a refusal of the code with the error code from Google', async () => {
  const ctx = await setupTest();

  ctx.provider.answerToken(() => Response.json({ error: 'invalid_client' }, { status: 401 }));

  const result = await ctx.connect('code-work');

  expect(result).toStrictEqual({ kind: 'token_exchange_failed', googleError: 'invalid_client' });
});

test('it keeps nothing when the owner refuses on Google’s page, and uses up the state', async () => {
  const ctx = await setupTest();
  const started = await ctx.start('session-a');
  const refused = await ctx.finish('session-a', started.state, null);
  const retried = await ctx.finish('session-a', started.state);

  expect([refused, retried, ctx.google.codeRequests]).toStrictEqual([
    { kind: 'consent_refused' },
    { kind: 'consent_not_found' },
    [],
  ]);
});

test('it lists the scopes the owner unticked as missing, and still connects', async () => {
  const ctx = await setupTest();

  ctx.google.accounts.set('code-work', {
    sub: 'sub-work',
    email: 'work@example.test',
    scopes: ['calendar.events'],
    hasRefreshToken: true,
  });

  ctx.google.apiAnswers.set('/gmail/v1/users/me/labels', {
    status: 403,
    body: '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
  });

  ctx.google.apiAnswers.set('/drive/v3/files', {
    status: 403,
    body: '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
  });

  ctx.google.apiAnswers.set('/calendar/v3/users/me/calendarList', { status: 403, body: '{}' });

  const result = await ctx.connect('code-work');

  expect(result).toStrictEqual({
    kind: 'finished',
    connection: expect.any(String),
    missing: [
      { scope: 'gmail.modify', reason: 'not_granted' },
      { scope: 'calendar.calendarlist.readonly', reason: 'not_granted' },
      { scope: 'drive.file', reason: 'api_disabled' },
    ],
  });
});

test('it falls back on the scopes of the token response when Google cannot be read', async () => {
  const ctx = await setupTest();

  ctx.google.accounts.set('code-work', {
    sub: 'sub-work',
    email: 'work@example.test',
    scopes: ['gmail.modify'],
    hasRefreshToken: true,
  });

  for (const path of [
    '/gmail/v1/users/me/labels',
    '/calendar/v3/calendars/primary/events',
    '/calendar/v3/users/me/calendarList',
    '/drive/v3/files',
  ]) {
    ctx.google.apiAnswers.set(path, { status: 503, body: '' });
  }

  const result = await ctx.connect('code-work');

  expect(result).toStrictEqual({
    kind: 'finished',
    connection: expect.any(String),
    missing: [
      { scope: 'calendar.events', reason: 'not_granted' },
      { scope: 'calendar.calendarlist.readonly', reason: 'not_granted' },
      { scope: 'drive.file', reason: 'not_granted' },
    ],
  });
});

test('it renews the connection of an account that consents again, with the new token under a new key', async () => {
  const ctx = await setupTest();
  const first = await ctx.connect('code-work');

  invariant(first.kind === 'finished', 'the first consent finishes');

  const keys = await ctx.countKeys();
  const second = await ctx.connect('code-work');
  const listed = await ctx.connections.list();
  const records = await ctx.readKinds();

  const connected = records
    .filter((record) => record.kind === connectedCodec.kind)
    .map((record) => connectedCodec.decode(record.payload).again);

  expect([
    second,
    listed.map((entry) => entry.connection),
    connected,
    await ctx.countKeys(),
  ]).toStrictEqual([
    { kind: 'finished', connection: first.connection, missing: [] },
    [first.connection],
    [false, true],
    keys,
  ]);
});

test('it keeps the label and the account of a connection through a refresh', async () => {
  const ctx = await setupTest();
  const first = await ctx.connect('code-work');

  invariant(first.kind === 'finished', 'the first consent finishes');

  const rows = await ctx.readRows();
  const context = await ctx.connections.readContext(rows[0]?.connection_id ?? '');

  ctx.clock.advance(2 * 60 * 60 * 1000);

  await context?.fetch(`${ctx.provider.apiOrigin}/gmail/v1/users/me/labels`);

  const [after] = await ctx.connections.list();

  expect([after?.label, after?.account, ctx.google.codeRequests.length]).toStrictEqual([
    'work@example.test',
    'work@example.test',
    1,
  ]);

  expect(
    ctx.provider.requests.filter((request) => request.form['grant_type'] === 'refresh_token'),
  ).toHaveLength(1);
});

test('it answers ACCOUNT_MISMATCH for a consent again with another account, and keeps its token out', async () => {
  const ctx = await setupTest();
  const first = await ctx.connect('code-work');

  invariant(first.kind === 'finished', 'the first consent finishes');

  const keys = await ctx.countKeys();

  const revokes = ctx.countRequests('/revoke');

  const result = await ctx.connect('code-home', first.connection);
  const listed = await ctx.connections.list();
  const records = await ctx.readKinds();

  const discarded = records
    .filter((record) => record.kind === consentDiscardedCodec.kind)
    .map((record) => consentDiscardedCodec.decode(record.payload));

  expect([
    result,
    listed.map((entry) => [entry.connection, entry.status]),
    discarded,
    await ctx.countKeys(),
    ctx.countRequests('/revoke') - revokes,
  ]).toStrictEqual([
    { kind: 'account_mismatch' },
    [[first.connection, 'active']],
    [{ reason: 'account_mismatch', revocation: 'confirmed' }],
    keys,
    1,
  ]);
});

test('it never revokes the grant of an account that another live connection reaches', async () => {
  const ctx = await setupTest();
  const work = await ctx.connect('code-work');

  await ctx.connect('code-home');

  invariant(work.kind === 'finished', 'the work consent finishes');

  const revokes = ctx.countRequests('/revoke');

  const result = await ctx.connect('code-home', work.connection);
  const records = await ctx.readKinds();

  const discarded = records
    .filter((record) => record.kind === consentDiscardedCodec.kind)
    .map((record) => consentDiscardedCodec.decode(record.payload));

  expect([result, ctx.countRequests('/revoke') - revokes, discarded]).toStrictEqual([
    { kind: 'account_mismatch' },
    0,
    [{ reason: 'account_mismatch', revocation: 'not_attempted' }],
  ]);
});

test('it answers FORGET_IN_PROGRESS for an account whose Forget does not finish in time, and keeps no token', async () => {
  const ctx = await setupTest();
  const work = await ctx.connect('code-work');

  invariant(work.kind === 'finished', 'the work consent finishes');

  ctx.effects.crashAt('erasure.revoked');

  await ctx.connections.forgetConnection(work.connection);

  const result = await ctx.connect('code-work');
  const records = await ctx.readKinds();

  const discarded = records
    .filter((record) => record.kind === consentDiscardedCodec.kind)
    .map((record) => consentDiscardedCodec.decode(record.payload).reason);

  expect([result, discarded]).toStrictEqual([
    { kind: 'forget_in_progress' },
    ['forget_in_progress'],
  ]);
});

test('it makes a new connection for an account whose Forget finished while the consent waited', async () => {
  const ctx = await setupTest();
  const work = await ctx.connect('code-work');

  invariant(work.kind === 'finished', 'the work consent finishes');

  ctx.effects.crashAt('erasure.revoked');

  await ctx.connections.forgetConnection(work.connection);

  const started = await ctx.start('session-a');

  const finishing = ctx.finish('session-a', started.state);

  await ctx.runner.finishOpen();

  const result = await finishing;
  const listed = await ctx.connections.list();

  expect([result.kind, listed.map((entry) => entry.status)]).toStrictEqual([
    'finished',
    ['forgotten', 'active'],
  ]);
});

test('it keeps no token for a consent again whose connection was forgotten during the consent', async () => {
  const ctx = await setupTest();
  const work = await ctx.connect('code-work');

  invariant(work.kind === 'finished', 'the work consent finishes');

  const started = await ctx.start('session-a', work.connection);

  await ctx.connections.forgetConnection(work.connection);

  const result = await ctx.finish('session-a', started.state);
  const listed = await ctx.connections.list();

  expect([result, listed.map((entry) => entry.status)]).toStrictEqual([
    { kind: 'consent_not_found' },
    ['forgotten'],
  ]);
});

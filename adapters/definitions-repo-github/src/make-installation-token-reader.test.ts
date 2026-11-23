import { expect, test } from 'bun:test';
import { generateKeyPairSync, verify } from 'node:crypto';
import { network } from '@heynixie/mock-server';
import { HttpResponse, http } from 'msw';
import invariant from 'tiny-invariant';
import { buildGitHubDefinitionsRepo } from './build-github-definitions-repo';
import { makeInstallationTokenReader } from './make-installation-token-reader';
import { createMockGitHubRepo } from './mocks/create-mock-github-repo';
import { githubAPIURL } from './mocks/github-api-url';

function setupTest() {
  const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const privateKeyPEM = keys.privateKey.export({ type: 'pkcs8', format: 'pem' });

  const clock = {
    nowMs: 0,
    set: (nowMs: number) => void (clock.nowMs = nowMs),
    advance: (deltaMs: number) => void (clock.nowMs += deltaMs),
  };

  const mints: string[] = [];

  return {
    clock,
    mints,
    mintURL: `${githubAPIURL}/app/installations/4242/access_tokens`,
    publicKey: keys.publicKey,
    privateKeyPEM,
    readToken: makeInstallationTokenReader({
      apiURL: githubAPIURL,
      clientID: 'Iv1.harbour',
      installationID: 4242,
      privateKey: privateKeyPEM,
      readNowMs: () => clock.nowMs,
    }),
  };
}

test('it mints an installation token with a JWT that the App key signed', async () => {
  const ctx = setupTest();

  ctx.clock.set(Date.parse('2030-01-01T00:00:00Z'));

  network.use(
    http.post(ctx.mintURL, (info) => {
      ctx.mints.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({
        token: `installation-token-${ctx.mints.length}`,
        expires_at: new Date(ctx.clock.nowMs + 3_600_000).toISOString(),
      });
    }),
  );

  const token = await ctx.readToken();

  const jwt = ctx.mints[0]?.replace('Bearer ', '') ?? '';
  const [header = '', claims = '', signature = ''] = jwt.split('.');

  expect(token).toBe('installation-token-1');

  expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toStrictEqual({
    alg: 'RS256',
    typ: 'JWT',
  });

  expect(JSON.parse(Buffer.from(claims, 'base64url').toString())).toStrictEqual({
    iss: 'Iv1.harbour',
    iat: 1_893_455_940,
    exp: 1_893_456_540,
  });

  expect(
    verify(
      'RSA-SHA256',
      Buffer.from(`${header}.${claims}`),
      ctx.publicKey,
      Buffer.from(signature, 'base64url'),
    ),
  ).toBeTrue();
});

test('it signs the export in with the minted token', async () => {
  const ctx = setupTest();

  ctx.clock.set(Date.parse('2030-01-01T00:00:00Z'));

  await createMockGitHubRepo({
    repository: 'harbour/definitions',
    base: 'main',
    token: 'installation-token-1',
  });

  network.use(
    http.post(ctx.mintURL, (info) => {
      ctx.mints.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({
        token: `installation-token-${ctx.mints.length}`,
        expires_at: new Date(ctx.clock.nowMs + 3_600_000).toISOString(),
      });
    }),
  );

  const repo = buildGitHubDefinitionsRepo({
    repository: 'harbour/definitions',
    base: 'main',
    readToken: ctx.readToken,
    apiURL: githubAPIURL,
  });

  expect(repo.readBaseRevision()).resolves.toBeString();
});

test('it reuses the token until 5 min before it expires', async () => {
  const ctx = setupTest();

  ctx.clock.set(Date.parse('2030-01-01T00:00:00Z'));

  network.use(
    http.post(ctx.mintURL, (info) => {
      ctx.mints.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({
        token: `installation-token-${ctx.mints.length}`,
        expires_at: new Date(ctx.clock.nowMs + 3_600_000).toISOString(),
      });
    }),
  );

  await ctx.readToken();

  ctx.clock.advance(3_600_000 - 300_000 - 1);

  const token = await ctx.readToken();

  expect(token).toBe('installation-token-1');
  expect(ctx.mints).toHaveLength(1);
});

test('it mints again once the token is within 5 min of its expiry', async () => {
  const ctx = setupTest();

  ctx.clock.set(Date.parse('2030-01-01T00:00:00Z'));

  network.use(
    http.post(ctx.mintURL, (info) => {
      ctx.mints.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({
        token: `installation-token-${ctx.mints.length}`,
        expires_at: new Date(ctx.clock.nowMs + 3_600_000).toISOString(),
      });
    }),
  );

  await ctx.readToken();

  ctx.clock.advance(3_600_000 - 300_000);

  const token = await ctx.readToken();

  expect(token).toBe('installation-token-2');
  expect(ctx.mints).toHaveLength(2);
});

test('it mints once for requests that arrive together', async () => {
  const ctx = setupTest();

  ctx.clock.set(Date.parse('2030-01-01T00:00:00Z'));

  network.use(
    http.post(ctx.mintURL, (info) => {
      ctx.mints.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({
        token: `installation-token-${ctx.mints.length}`,
        expires_at: new Date(ctx.clock.nowMs + 3_600_000).toISOString(),
      });
    }),
  );

  const tokens = await Promise.all([ctx.readToken(), ctx.readToken()]);

  expect(tokens).toStrictEqual(['installation-token-1', 'installation-token-1']);
  expect(ctx.mints).toHaveLength(1);
});

test('it fails with the status and message of GitHub and quotes no key or JWT', async () => {
  const ctx = setupTest();
  const sent: string[] = [];

  network.use(
    http.post(ctx.mintURL, (info) => {
      sent.push(info.request.headers.get('authorization') ?? '');

      return HttpResponse.json({ message: 'Integration not found' }, { status: 404 });
    }),
  );

  const failure = await ctx.readToken().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  const jwt = sent[0]?.replace('Bearer ', '') ?? '';

  expect(failure.message).toBe(
    'GitHub refused to mint an installation token for the export with 404: Integration not found',
  );

  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/u);
  expect(failure.message).not.toInclude(jwt);
  expect(failure.message).not.toInclude('PRIVATE KEY');
});

test('it fails with no key text when the key is not a PEM', async () => {
  const reader = makeInstallationTokenReader({
    apiURL: githubAPIURL,
    clientID: 'Iv1.harbour',
    installationID: 4242,
    privateKey: 'not-a-pem-secret-text',
    readNowMs: () => 0,
  });

  const failure = await reader().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  expect(failure.message).toBe(
    'definitions_export_app_key is not a usable RSA private key in PEM form',
  );
});

test('it redacts a JWT and a key that GitHub echoes in its message', async () => {
  const ctx = setupTest();
  const sent: string[] = [];

  network.use(
    http.post(ctx.mintURL, (info) => {
      const authorization = info.request.headers.get('authorization') ?? '';

      sent.push(authorization);

      return HttpResponse.json(
        { message: `Bad credentials for ${authorization} with ${ctx.privateKeyPEM}` },
        { status: 401 },
      );
    }),
  );

  const failure = await ctx.readToken().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  const jwt = sent[0]?.replace('Bearer ', '') ?? '';

  expect(jwt).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/u);
  expect(failure.message).not.toInclude(jwt);
  expect(failure.message).not.toInclude('PRIVATE KEY');
  expect(failure.message).toStartWith('GitHub refused to mint an installation token');
});

test('it refuses a private key that is not RSA', async () => {
  const ecKey = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
    type: 'pkcs8',
    format: 'pem',
  });

  const reader = makeInstallationTokenReader({
    apiURL: githubAPIURL,
    clientID: 'Iv1.harbour',
    installationID: 4242,
    privateKey: ecKey,
    readNowMs: () => 0,
  });

  const failure = await reader().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  expect(failure.message).toBe(
    'definitions_export_app_key is not a usable RSA private key in PEM form',
  );
});

test('it fails when GitHub answers a mint with an unreadable body', async () => {
  const ctx = setupTest();

  network.use(http.post(ctx.mintURL, () => HttpResponse.json({ token: 'installation-token-1' })));

  const failure = await ctx.readToken().then(
    () => null,
    (error: unknown) => error,
  );

  invariant(failure instanceof Error);

  expect(failure.message).toBe(
    'GitHub answered the installation token request with an unreadable body',
  );
});

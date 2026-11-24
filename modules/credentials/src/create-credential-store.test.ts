import { expect, onTestFinished, test } from 'bun:test';
import { CredentialRefusalError, buildValueForms } from '@heynixie/egress';
import { buildStubResolver, startTestSite } from '@heynixie/egress/test-utils';
import type { SecretSpec } from '@heynixie/sandbox';
import { createCredentialStore } from './create-credential-store';
import { deriveFingerprintKey } from './fingerprint/derive-fingerprint-key';
import { buildHostHeldName } from './grant/build-host-held-name';
import { createOwnValueSet } from './own-values/create-own-value-set';
import type { CredentialSpec, FileCredentialRef } from './types';

interface TestStoreOptions {
  readonly ca: string;
}

interface LeakingSiteOptions {
  readonly reply: (value: string) => string | ReadableStream<Uint8Array>;
}

async function setupTest(answers: Readonly<Record<string, readonly (readonly string[])[]>> = {}) {
  const value = 'fake-service-value-0001';

  const ref: FileCredentialRef = {
    backend: 'file',
    group: 'connector_credentials',
    name: 'service',
  };

  const settingRef: FileCredentialRef = { backend: 'file', group: 'settings', name: 'gateway' };

  const site = await startTestSite({
    names: ['service.test', 'other.test'],
    respond: () => new Response('ok'),
  });

  const values = new Map([
    [ref.name, value],
    [settingRef.name, 'fake-gateway-value-0002'],
  ]);

  const ownValues = createOwnValueSet();

  const fingerprintKey = await deriveFingerprintKey(Buffer.alloc(32, 9));

  const resolver = buildStubResolver({
    answers: {
      'service.test': Array.from({ length: 8 }, () => ['127.0.0.1']),
      'other.test': Array.from({ length: 8 }, () => ['127.0.0.1']),
      ...answers,
    },
  });

  const secrets = {
    readFileValue: (found: FileCredentialRef) => values.get(found.name) ?? '',
    fingerprintKey,
    ownValues,
  };

  const createStore = (options?: TestStoreOptions) =>
    createCredentialStore({
      secrets,
      resolveHost: () => Promise.resolve(['127.0.0.1']),
      denied: [],
      ...(options === undefined ? {} : { test: { checkAddress: () => true, ca: options.ca } }),
    });

  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const serveLocal = (answer: () => Response) => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });

    stack.defer(() => server.stop(true));

    return server;
  };

  const startLeakingSite = (options: LeakingSiteOptions) =>
    serveLocal(
      () =>
        new Response(options.reply(value), {
          headers: { 'x-echo': `seen ${value}`, 'content-type': 'text/plain' },
        }),
    );

  return {
    value,
    ref,
    settingRef,
    site,
    ownValues,
    values,
    secrets,
    createStore,
    startLeakingSite,
    serveLocal,
    resolveHost: resolver.resolveHost,
    production: createCredentialStore({
      secrets,
      resolveHost: resolver.resolveHost,
      denied: [],
    }),
    store: createCredentialStore({
      secrets,
      resolveHost: resolver.resolveHost,
      denied: [],
      test: { checkAddress: (address) => address === '127.0.0.1', ca: site.ca },
    }),
    origin: `https://service.test:${site.port}`,
    otherOrigin: `https://other.test:${site.port}`,
    spec: (
      origins: readonly string[],
      placement?: CredentialSpec['placement'],
    ): CredentialSpec => ({
      kind: 'static',
      label: 'Service',
      origins,
      ...(placement === undefined ? {} : { placement }),
    }),
  };
}

test('it adds the credential as a bearer header on a request to an allowed origin', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin]));
  const fetchWith = ctx.store.fetcher(binding, [ctx.origin]);

  const response = await fetchWith(`${ctx.origin}/search`, { method: 'POST', body: 'query' });
  const text = await response.text();

  expect(text).toBe('ok');
  expect(ctx.site.requests).toMatchObject([{ headers: { authorization: `Bearer ${ctx.value}` } }]);
});

test('it places the value in a header of its own, with or without a scheme', async () => {
  const ctx = await setupTest();

  const raw = ctx.store.register(ctx.ref, ctx.spec([ctx.origin], { header: 'x-api-key' }));

  const bearer = ctx.store.register(
    ctx.settingRef,
    ctx.spec([ctx.origin], { header: 'x-token', scheme: 'Bearer' }),
  );

  await ctx.store.fetcher(raw, [ctx.origin])(`${ctx.origin}/a`);
  await ctx.store.fetcher(bearer, [ctx.origin])(`${ctx.origin}/b`);

  expect(ctx.site.requests).toMatchObject([
    { headers: { 'x-api-key': ctx.value } },
    { headers: { 'x-token': 'Bearer fake-gateway-value-0002' } },
  ]);
});

test('it places the value as the password of HTTP Basic', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(
    ctx.ref,
    ctx.spec([ctx.origin], { basic: { user: 'account' } }),
  );

  await ctx.store.fetcher(binding, [ctx.origin])(`${ctx.origin}/a`);

  const pair = Buffer.from(`account:${ctx.value}`).toString('base64');

  expect(ctx.site.requests).toMatchObject([{ headers: { authorization: `Basic ${pair}` } }]);
});

test('it places the value in the URL path where {credential} stands', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin], { path: true }));

  await ctx.store.fetcher(binding, [ctx.origin])(`${ctx.origin}/bot{credential}/send`);

  expect(ctx.site.requests).toMatchObject([{ url: `${ctx.origin}/bot${ctx.value}/send` }]);
});

test('it refuses a request to an origin the caller did not pass, and sends nothing', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin, ctx.otherOrigin]));
  const fetchWith = ctx.store.fetcher(binding, [ctx.origin]);

  expect(fetchWith(`${ctx.otherOrigin}/x`)).rejects.toThrow(CredentialRefusalError);
  expect(ctx.site.requests).toStrictEqual([]);
});

test('it refuses an origin the credential spec lacks when the fetcher is made', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin]));

  expect(() => ctx.store.fetcher(binding, [ctx.otherOrigin])).toThrow(
    `${ctx.otherOrigin} is not an origin of the credential Service`,
  );
});

test('it refuses http for a service that is not the deployment own', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec(['http://service.test:80']));

  expect(
    ctx.store.fetcher(binding, ['http://service.test:80'])('http://service.test/'),
  ).rejects.toThrow(CredentialRefusalError);
});

test.each(['Authorization', 'proxy-authorization', 'Cookie', 'X-Api-Key'])(
  'it refuses a request that sets the %s header',
  async (header) => {
    const ctx = await setupTest();

    const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin], { header: 'x-api-key' }));
    const fetchWith = ctx.store.fetcher(binding, [ctx.origin]);

    expect(fetchWith(`${ctx.origin}/x`, { headers: { [header]: 'caller-value' } })).rejects.toThrow(
      CredentialRefusalError,
    );

    expect(ctx.site.requests).toStrictEqual([]);
  },
);

test('it refuses a URL that holds a user name or a password', async () => {
  const ctx = await setupTest();

  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin]));
  const fetchWith = ctx.store.fetcher(binding, [ctx.origin]);

  expect(fetchWith(`https://name:word@service.test:${ctx.site.port}/x`)).rejects.toThrow(
    CredentialRefusalError,
  );
});

test('it keeps the credential on a redirect to the same origin', async () => {
  const ctx = await setupTest();

  const site = await startTestSite({
    names: ['service.test'],
    respond: (request) =>
      new URL(request.url).pathname === '/start'
        ? new Response(null, { status: 302, headers: { location: '/landed' } })
        : new Response('landed'),
  });

  const store = ctx.createStore({ ca: site.ca });
  const origin = `https://service.test:${site.port}`;
  const binding = store.register(ctx.ref, ctx.spec([origin]));

  const response = await store.fetcher(binding, [origin])(`${origin}/start`);
  const text = await response.text();

  expect(text).toBe('landed');

  expect(site.requests).toMatchObject([
    { headers: { authorization: `Bearer ${ctx.value}` } },
    { url: `${origin}/landed`, headers: { authorization: `Bearer ${ctx.value}` } },
  ]);
});

test('it drops the credential on a redirect to another origin the caller allowed', async () => {
  const ctx = await setupTest();

  const site = await startTestSite({
    names: ['service.test', 'other.test'],
    respond: (request) => {
      const url = new URL(request.url);

      return url.hostname === 'service.test'
        ? new Response(null, {
            status: 302,
            headers: { location: `https://other.test:${url.port}/landed` },
          })
        : new Response('landed');
    },
  });

  const store = ctx.createStore({ ca: site.ca });
  const origin = `https://service.test:${site.port}`;
  const other = `https://other.test:${site.port}`;
  const binding = store.register(ctx.ref, ctx.spec([origin, other]));

  const response = await store.fetcher(binding, [origin, other])(`${origin}/start`);
  const text = await response.text();

  expect(text).toBe('landed');

  expect(site.requests.map((request) => request.headers['authorization'])).toStrictEqual([
    `Bearer ${ctx.value}`,
    undefined,
  ]);
});

test('it refuses a redirect to an origin the caller did not pass', async () => {
  const ctx = await setupTest();

  const site = await startTestSite({
    names: ['service.test'],
    respond: () =>
      new Response(null, { status: 302, headers: { location: 'https://stray.test/' } }),
  });

  const store = ctx.createStore({ ca: site.ca });
  const origin = `https://service.test:${site.port}`;
  const binding = store.register(ctx.ref, ctx.spec([origin]));

  expect(store.fetcher(binding, [origin])(`${origin}/start`)).rejects.toThrow(
    'https://stray.test is not an origin this credential may reach',
  );
});

test('it returns a redirect unfollowed when redirects is none', async () => {
  const ctx = await setupTest();

  const site = await startTestSite({
    names: ['service.test'],
    respond: () => new Response(null, { status: 302, headers: { location: '/elsewhere' } }),
  });

  const store = ctx.createStore({ ca: site.ca });
  const origin = `https://service.test:${site.port}`;
  const binding = store.register(ctx.ref, ctx.spec([origin]));

  const response = await store.fetcher(binding, [origin], { redirects: 'none' })(`${origin}/start`);

  expect([response.status, response.headers.get('location')]).toStrictEqual([302, '/elsewhere']);
});

test('it refuses a host that resolves to a non-public address, and connects to nothing', async () => {
  const ctx = await setupTest({ 'service.test': [['10.0.0.5']] });

  const binding = ctx.production.register(ctx.ref, ctx.spec([ctx.origin]));

  expect(ctx.production.fetcher(binding, [ctx.origin])(`${ctx.origin}/x`)).rejects.toThrow(
    'service.test resolves to 10.0.0.5, which is not a public address',
  );

  expect(ctx.site.requests).toStrictEqual([]);
});

test('it checks the address of every hop, so a redirect into a private host is refused', async () => {
  const ctx = await setupTest({ 'other.test': [['169.254.169.254']] });

  const site = await startTestSite({
    names: ['service.test'],
    respond: () =>
      new Response(null, { status: 302, headers: { location: 'https://other.test/meta' } }),
  });

  const store = createCredentialStore({
    secrets: ctx.secrets,
    resolveHost: buildStubResolver({
      answers: { 'service.test': [['127.0.0.1']], 'other.test': [['169.254.169.254']] },
    }).resolveHost,
    denied: [],
    test: { checkAddress: (address) => address === '127.0.0.1', ca: site.ca },
  });

  const origin = `https://service.test:${site.port}`;
  const binding = store.register(ctx.ref, ctx.spec([origin, 'https://other.test']));

  expect(store.fetcher(binding, [origin, 'https://other.test'])(`${origin}/x`)).rejects.toThrow(
    'other.test resolves to 169.254.169.254, which is not a public address',
  );
});

test('it lets a deployment service use http and a private address', async () => {
  const ctx = await setupTest();

  const server = ctx.serveLocal(() => new Response('control'));
  const origin = `http://gateway.test:${server.port}`;
  const store = ctx.createStore();

  const fetchWith = store.fetcher(store.register(ctx.settingRef, ctx.spec([origin])), [origin], {
    deploymentService: true,
  });

  const response = await fetchWith(`${origin}/status`);
  const text = await response.text();

  expect(text).toBe('control');
});

test.each([
  { form: 'plain', format: (value: string) => `key=${value}` },
  { form: 'URL-encoded', format: (value: string) => `key=${encodeURIComponent(value)}` },
  {
    form: 'base64',
    format: (value: string) => `key=${Buffer.from(`user:${value}`).toString('base64')}`,
  },
])('it removes the $form form of the value from a body and a header', async (row) => {
  const ctx = await setupTest();

  const server = ctx.startLeakingSite({ reply: row.format });
  const origin = `http://gateway.test:${server.port}`;
  const store = ctx.createStore();

  const fetchWith = store.fetcher(store.register(ctx.ref, ctx.spec([origin])), [origin], {
    deploymentService: true,
  });

  const response = await fetchWith(`${origin}/x`);
  const text = await response.text();

  expect(response.headers.get('x-echo')).toBe('seen [secret removed]');
  expect(text).toStartWith('key=');
  expect(text).toContain('[secret removed]');
  expect(buildValueForms(ctx.value).some((form) => text.includes(form))).toBe(false);
});

test('it removes a value that the service sends split across stream chunks', async () => {
  const ctx = await setupTest();

  const halves = [`before ${ctx.value.slice(0, 9)}`, `${ctx.value.slice(9)} after`];

  const server = ctx.startLeakingSite({
    reply: () =>
      new ReadableStream<Uint8Array>({
        pull(controller) {
          const half = halves.shift();

          if (half === undefined) {
            controller.close();
          } else {
            controller.enqueue(new TextEncoder().encode(half));
          }
        },
      }),
  });

  const origin = `http://gateway.test:${server.port}`;
  const store = ctx.createStore();

  const fetchWith = store.fetcher(store.register(ctx.ref, ctx.spec([origin])), [origin], {
    deploymentService: true,
  });

  const response = await fetchWith(`${origin}/x`);
  const text = await response.text();

  expect(text).toBe('before [secret removed] after');
});

test('it removes the value from an error message', async () => {
  const ctx = await setupTest();

  const site = await startTestSite({
    names: ['service.test'],
    respond: () =>
      new Response(null, { status: 302, headers: { location: `https://${ctx.value}.test/` } }),
  });

  const store = ctx.createStore({ ca: site.ca });
  const origin = `https://service.test:${site.port}`;
  const fetchWith = store.fetcher(store.register(ctx.ref, ctx.spec([origin])), [origin]);

  expect(fetchWith(`${origin}/x`)).rejects.toThrowWithMessage(
    CredentialRefusalError,
    'https://[secret removed].test is not an origin this credential may reach',
  );
});

test('it refuses a response larger than 32 MiB', async () => {
  const ctx = await setupTest();

  const server = ctx.serveLocal(() => new Response(new Uint8Array(32 * 1024 * 1024 + 1)));
  const origin = `http://gateway.test:${server.port}`;
  const store = ctx.createStore();

  const fetchWith = store.fetcher(store.register(ctx.ref, ctx.spec([origin])), [origin], {
    deploymentService: true,
  });

  expect(fetchWith(`${origin}/x`)).rejects.toThrow(CredentialRefusalError);
});

test('it adds a registered value to the live set, and a setting joins every scan', async () => {
  const ctx = await setupTest();

  ctx.store.register(ctx.ref, ctx.spec([ctx.origin]));
  ctx.store.register(ctx.settingRef, ctx.spec([ctx.origin]));

  expect(ctx.ownValues.read({ entries: ['connector_credentials'], minChars: 8 })).toStrictEqual([
    ctx.value,
    'fake-gateway-value-0002',
  ]);
});

test('it reuses the binding of one reference and one spec', async () => {
  const ctx = await setupTest();

  expect(ctx.store.register(ctx.ref, ctx.spec([ctx.origin]))).toStrictEqual(
    ctx.store.register(ctx.ref, ctx.spec([ctx.origin])),
  );
});

test('it grants a host-held credential under the name its profile always gave', async () => {
  const ctx = await setupTest();

  const added: SecretSpec[] = [];

  const granted = await ctx.store.grant(
    { hostHeld: true },
    { addSecret: (secret) => Promise.resolve(void added.push(secret)) },
    { profileID: 'opus', header: 'bearer', host: 'api.anthropic.com' },
  );

  expect(granted).toStrictEqual({ secret: 'nixie-model-528d8dae09a6d4f1e0e' });

  expect(added).toStrictEqual([
    {
      name: 'nixie-model-528d8dae09a6d4f1e0e',
      value: null,
      host: 'api.anthropic.com',
      header: 'bearer',
    },
  ]);
});

test('it names a held credential by a keyed digest and records its reference and fingerprint', async () => {
  const ctx = await setupTest();

  const added: SecretSpec[] = [];
  const request = { profileID: 'opus', header: 'bearer', host: 'api.anthropic.com' } as const;
  const binding = ctx.store.register(ctx.ref, { ...ctx.spec([ctx.origin]), kind: 'model' });

  const granted = await ctx.store.grant(
    binding,
    { addSecret: (secret) => Promise.resolve(void added.push(secret)) },
    request,
  );

  expect(granted).toStrictEqual({
    secret: expect.stringMatching(/^nixie-model-[0-9a-f]{19}$/u),
    reference: 'deployment:service',
    fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u),
  });

  expect(granted.secret).not.toBe(buildHostHeldName(request));

  expect(added).toStrictEqual([
    {
      name: granted.secret,
      value: ctx.value,
      host: 'api.anthropic.com',
      header: 'bearer',
      reference: 'deployment:service',
      fingerprint: expect.stringMatching(/^[0-9a-f]{8}$/u),
    },
  ]);
});

test('it gives a rotated value a new broker name', async () => {
  const ctx = await setupTest();

  const sandboxes = { addSecret: () => Promise.resolve() };
  const request = { profileID: 'opus', header: 'bearer', host: 'api.anthropic.com' } as const;
  const binding = ctx.store.register(ctx.ref, ctx.spec([ctx.origin]));

  const before = await ctx.store.grant(binding, sandboxes, request);

  ctx.values.set(ctx.ref.name, 'fake-rotated-value-0003');

  const after = await ctx.store.grant(binding, sandboxes, request);

  expect(after.secret).not.toBe(before.secret);
});

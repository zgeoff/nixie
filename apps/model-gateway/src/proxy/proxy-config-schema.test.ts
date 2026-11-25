import { expect, test } from 'bun:test';
import { proxyConfigSchema } from './proxy-config-schema';

test('it reads a route that names the Responses API', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      review: {
        api: 'openai-responses',
        upstream: 'https://models.example.com',
        model: 'model-o',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2.5, cached_input: 0.1, output: 8 },
        maxOutputTokens: 32_000,
      },
    },
  });

  expect(result.data?.routes['review']?.api).toBe('openai-responses');
});

test('it rejects a Responses route with no maxOutputTokens, and names the route and the field', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse(ctx.buildRouteConfig({ api: 'openai-responses' }));

  expect(result.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toStrictEqual([
    [
      'routes.review.maxOutputTokens',
      expect.stringContaining(
        'the route review speaks openai-responses and sets no maxOutputTokens',
      ),
    ],
  ]);
});

test('it reads a Messages route with no maxOutputTokens as null', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse(ctx.buildRouteConfig({}));

  expect(result.data?.routes['review']?.maxOutputTokens).toBeNull();
});

test('it reads the maxOutputTokens of a route as given', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse(ctx.buildRouteConfig({ maxOutputTokens: 64_000 }));

  expect(result.data?.routes['review']?.maxOutputTokens).toBe(64_000);
});

test('it rejects a route that names an API the proxy does not count', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      review: {
        api: 'chat-completions',
        upstream: 'https://models.example.com',
        model: 'model-o',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2.5, cached_input: 0.1, output: 8 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'review', 'api'] });
});

test('it reads a config into its typed shape, with a trailing slash cut from the upstream and the Messages API as the default', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { hostname: '0.0.0.0', port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      preview: {
        upstream: 'https://models.example.com/',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data).toStrictEqual({
    listen: { hostname: '0.0.0.0', port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5, tokens: null },
    periods: null,
    capture: null,
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'https://models.example.com',
        model: 'model-small',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
        limits: null,
      },
    },
  });
});

test('it listens on the loopback when the config names no host', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { tokens: 1000 },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data?.listen).toStrictEqual({ hostname: '127.0.0.1', port: 18_090 });
});

test('it rejects limits that name neither dollars nor tokens', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: {},
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['limits'] });
});

test('it rejects a config with no route', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {},
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes'] });
});

test('it rejects a route with no 1-hour cache write price', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['routes', 'preview', 'prices', 'cache_write_1h'],
  });
});

test('it rejects a route ID that is not a lowercase slug', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      'Preview/A': {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'Preview/A'] });
});

test('it reads a capture key with its defaults for the byte and pending limits', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    capture: { spool: '/var/lib/nixie/spool' },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data?.capture).toStrictEqual({
    spool: '/var/lib/nixie/spool',
    maxBytes: 536_870_912,
    maxPending: 16,
  });
});

test('it reads a capture key with its own byte and pending limits', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    capture: { spool: '/var/lib/nixie/spool', max_bytes: 1000, max_pending: 2 },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data?.capture).toStrictEqual({
    spool: '/var/lib/nixie/spool',
    maxBytes: 1000,
    maxPending: 2,
  });
});

test('it reads a config with no capture key as a capture of null', () => {
  expect(
    proxyConfigSchema.safeParse({
      listen: { port: 18_090 },
      store: '/var/lib/model-gateway/counter.json',
      limits: { dollars: 5 },
      routes: {
        preview: {
          upstream: 'https://models.example.com',
          model: 'model-small',
          prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
        },
      },
    }).data?.capture,
  ).toBeNull();
});

test('it rejects a relative capture spool', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    capture: { spool: 'relative/spool' },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['capture', 'spool'] });
});

test('it rejects a max_pending of 0', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    capture: { spool: '/var/lib/nixie/spool', max_pending: 0 },
    routes: {
      preview: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['capture', 'max_pending'] });
});

test('it rejects a capture key it does not know', () => {
  expect(
    proxyConfigSchema.safeParse({
      listen: { port: 18_090 },
      store: '/var/lib/model-gateway/counter.json',
      limits: { dollars: 5 },
      capture: { spool: '/var/lib/nixie/spool', extra: 1 },
      routes: {
        preview: {
          upstream: 'https://models.example.com',
          model: 'model-small',
          prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
        },
      },
    }).success,
  ).toBeFalse();
});

test('it reads the login block of a route on a periods config', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: {
      plan: {
        api: 'openai-responses',
        upstream: 'https://chatgpt.example.com/backend-api/codex',
        model: 'model-o',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 8 },
        maxOutputTokens: 32_000,
        login: { file: '/var/lib/model-gateway/plan.json', routeKeyFile: '/run/secrets/plan-key' },
      },
    },
  });

  expect(result.data?.routes['plan']?.login).toStrictEqual({
    file: '/var/lib/model-gateway/plan.json',
    routeKeyFile: '/run/secrets/plan-key',
  });
});

test('it rejects a route with a login on a limits config', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse(
    ctx.buildRouteConfig({
      api: 'openai-responses',
      maxOutputTokens: 32_000,
      login: { file: '/var/lib/model-gateway/plan.json', routeKeyFile: '/run/secrets/plan-key' },
    }),
  );

  expect(result.error?.issues.map((issue) => issue.path.join('.'))).toStrictEqual([
    'routes.review.login',
  ]);
});

test.each([
  { file: 'plan.json', routeKeyFile: '/run/secrets/plan-key' },
  { file: '/var/lib/model-gateway/plan.json', routeKeyFile: 'plan-key' },
  { file: '/var/lib/model-gateway/plan.json' },
])('it rejects a login block of %j', (login) => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: {
      plan: {
        upstream: 'https://models.example.com',
        model: 'model-o',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 8 },
        login,
      },
    },
  });

  expect(result.success).toBeFalse();
});

function setupTest() {
  return {
    buildRouteConfig: (route: Record<string, unknown>) => ({
      listen: { port: 18_090 },
      store: '/var/lib/model-gateway/counter.json',
      limits: { dollars: 5 },
      routes: {
        review: {
          upstream: 'https://models.example.com',
          model: 'model-o',
          prices: {
            input: 1,
            cache_write: 1.25,
            cache_write_1h: 2.5,
            cached_input: 0.1,
            output: 8,
          },
          ...route,
        },
      },
    }),
    periodsConfig: {
      listen: { port: 18_090 },
      store: '/var/lib/model-gateway/counter.json',
      periods: { zone: 'Europe/London' },
      control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
      routes: {
        preview: {
          upstream: 'https://models.example.com',
          model: 'model-small',
          prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
        },
      },
    },
  };
}

test('it reads periods with a loopback control listener, no override and the limits of each route', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: {
      preview: {
        ...ctx.periodsConfig.routes.preview,
        limits: { day: 40, month: 600 },
      },
      bare: ctx.periodsConfig.routes.preview,
    },
  });

  expect(result.data).toMatchObject({
    limits: null,
    periods: {
      zone: 'Europe/London',
      control: {
        listen: { hostname: '127.0.0.1', port: 18_091 },
        tokenFile: '/run/secrets/gateway-control-token',
      },
      countBySandbox: false,
      override: null,
    },
    routes: {
      preview: { limits: { day: 40, month: 600, dayCap: 80 } },
      bare: { limits: null },
    },
  });
});

test('it reads the day cap that a route names', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: {
      preview: {
        ...ctx.periodsConfig.routes.preview,
        limits: { day: 40, month: 600, dayCap: 55 },
      },
    },
  });

  expect(result.data?.routes['preview']?.limits).toStrictEqual({ day: 40, month: 600, dayCap: 55 });
});

test.each([
  ['a day cap below the day limit', { day: 40, month: 600, dayCap: 39 }],
  ['a day limit of zero', { day: 0, month: 600 }],
  ['a token limit', { day: 40, month: 600, tokens: 5 }],
])('it rejects %s', (_name, limits) => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: { preview: { ...ctx.periodsConfig.routes.preview, limits } },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: expect.arrayContaining(['routes', 'preview', 'limits']),
  });
});

test('it rejects route limits in a limits config, which counts one total', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      preview: { ...ctx.periodsConfig.routes.preview, limits: { day: 1, month: 2 } },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'preview', 'limits'] });
});

test('it reads each periods key the config names', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    countBySandbox: true,
    override: '/var/lib/model-gateway/override.json',
  });

  expect(result.data?.periods).toMatchObject({
    countBySandbox: true,
    override: '/var/lib/model-gateway/override.json',
  });
});

test('it rejects a config that sets both limits and periods', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse({ ...ctx.periodsConfig, limits: { dollars: 5 } });

  expect(result.success).toBeFalse();
});

test('it rejects a config that sets neither limits nor periods', () => {
  const ctx = setupTest();
  const { periods: _periods, control: _control, ...neither } = ctx.periodsConfig;

  expect(proxyConfigSchema.safeParse(neither).success).toBeFalse();
});

test('it rejects periods with no control listener', () => {
  const ctx = setupTest();
  const { control: _control, ...noControl } = ctx.periodsConfig;
  const result = proxyConfigSchema.safeParse(noControl);

  expect(result.error?.issues).toPartiallyContain({ path: ['control'] });
});

test('it rejects a zone that is not an IANA zone', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    periods: { zone: 'Mars/Olympus' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['periods', 'zone'] });
});

test.each([
  ['countBySandbox', true],
  ['override', '/var/lib/model-gateway/override.json'],
])('it rejects %s in a limits config, which sets none of the periods keys', (key, value) => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    [key]: value,
    routes: ctx.periodsConfig.routes,
  });

  expect(result.error?.issues).toPartiallyContain({ path: [key] });
});

test('it rejects a relative override path', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse({ ...ctx.periodsConfig, override: 'override.json' });

  expect(result.error?.issues).toPartiallyContain({ path: ['override'] });
});

test('it rejects a relative control token file', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    control: { listen: { port: 18_091 }, tokenFile: 'token' },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['control', 'tokenFile'] });
});

test('it reads the provider pin of a route', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      review: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        providerPin: 'example-host',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data?.routes['review']?.providerPin).toBe('example-host');
});

test('it rejects an empty provider pin', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    limits: { dollars: 5 },
    routes: {
      review: {
        upstream: 'https://models.example.com',
        model: 'model-small',
        providerPin: '',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'review', 'providerPin'] });
});

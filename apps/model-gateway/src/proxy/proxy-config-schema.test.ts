import { expect, test } from 'bun:test';
import { proxyConfigSchema } from './proxy-config-schema';

test('it reads a route that names the Responses API', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      review: {
        api: 'openai-responses',
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      review: {
        api: 'chat-completions',
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
        upstream: 'https://models.example.com/',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data).toStrictEqual({
    listen: { hostname: '0.0.0.0', port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    periods: {
      zone: 'Europe/London',
      control: {
        listen: { hostname: '127.0.0.1', port: 18_091 },
        tokenFile: '/run/secrets/gateway-control-token',
      },
      countBySandbox: false,
      override: null,
    },
    capture: null,
    providers: { main: { limits: { day: 10, month: 100, dayCap: 20 } } },
    routes: {
      preview: {
        api: 'anthropic-messages',
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.data?.listen).toStrictEqual({ hostname: '127.0.0.1', port: 18_090 });
});

test('it rejects a config with no route', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {},
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes'] });
});

test('it rejects a route with no 1-hour cache write price', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/model-gateway/counter.json',
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      'Preview/A': {
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    capture: { spool: '/var/lib/nixie/spool' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    capture: { spool: '/var/lib/nixie/spool', max_bytes: 1000, max_pending: 2 },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
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
      periods: { zone: 'Europe/London' },
      control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
      providers: { main: { limits: { day: 10, month: 100 } } },
      routes: {
        preview: {
          provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    capture: { spool: 'relative/spool' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    capture: { spool: '/var/lib/nixie/spool', max_pending: 0 },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      preview: {
        provider: 'main',
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
      periods: { zone: 'Europe/London' },
      control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
      capture: { spool: '/var/lib/nixie/spool', extra: 1 },
      providers: { main: { limits: { day: 10, month: 100 } } },
      routes: {
        preview: {
          provider: 'main',
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
        provider: 'main',
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
        provider: 'main',
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
      periods: { zone: 'Europe/London' },
      control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
      providers: { main: { limits: { day: 10, month: 100 } } },
      routes: {
        review: {
          provider: 'main',
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
      providers: { main: { limits: { day: 10, month: 100 } } },
      routes: {
        preview: {
          provider: 'main',
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

test.each([{ dollars: 5 }, { tokens: 1000 }, {}])(
  'it rejects a limits key of %j, because no limit spans providers',
  (limits) => {
    const ctx = setupTest();
    const result = proxyConfigSchema.safeParse({ ...ctx.periodsConfig, limits });

    expect(result.error?.issues).toPartiallyContain({
      path: ['limits'],
      message: expect.stringContaining('no limit spans providers'),
    });
  },
);

test('it rejects a config with no periods', () => {
  const ctx = setupTest();
  const { periods: _periods, ...noPeriods } = ctx.periodsConfig;
  const result = proxyConfigSchema.safeParse(noPeriods);

  expect(result.error?.issues).toPartiallyContain({ path: ['periods'] });
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      review: {
        provider: 'main',
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
    periods: { zone: 'Europe/London' },
    control: { listen: { port: 18_091 }, tokenFile: '/run/secrets/gateway-control-token' },
    providers: { main: { limits: { day: 10, month: 100 } } },
    routes: {
      review: {
        provider: 'main',
        upstream: 'https://models.example.com',
        model: 'model-small',
        providerPin: '',
        prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 },
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'review', 'providerPin'] });
});

test('it reads the limits of a provider, with the day cap defaulting to twice the day limit', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    providers: {
      main: { limits: { day: 10, month: 100 } },
      other: { limits: { day: 3, month: 30, dayCap: 5 } },
    },
  });

  expect(result.data?.providers).toStrictEqual({
    main: { limits: { day: 10, month: 100, dayCap: 20 } },
    other: { limits: { day: 3, month: 30, dayCap: 5 } },
  });
});

test('it reads the provider of each route', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse(ctx.periodsConfig);

  expect(result.data?.routes['preview']?.provider).toBe('main');
});

test('it rejects a route with no provider', () => {
  const ctx = setupTest();
  const { provider: _provider, ...route } = ctx.periodsConfig.routes.preview;
  const result = proxyConfigSchema.safeParse({ ...ctx.periodsConfig, routes: { preview: route } });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes', 'preview', 'provider'] });
});

test('it rejects a route whose provider is no key of providers, and names both', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    routes: { preview: { ...ctx.periodsConfig.routes.preview, provider: 'ghost' } },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: ['routes', 'preview', 'provider'],
    message: expect.stringContaining('the provider ghost'),
  });
});

test('it rejects a provider with no limits', () => {
  const ctx = setupTest();
  const result = proxyConfigSchema.safeParse({ ...ctx.periodsConfig, providers: { main: {} } });

  expect(result.error?.issues).toPartiallyContain({ path: ['providers', 'main', 'limits'] });
});

test('it rejects a provider day cap below its day limit', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    providers: { main: { limits: { day: 10, month: 100, dayCap: 9 } } },
  });

  expect(result.error?.issues).toPartiallyContain({
    path: expect.arrayContaining(['providers', 'main', 'limits']),
  });
});

test('it rejects a provider ID that is not a lowercase slug', () => {
  const ctx = setupTest();

  const result = proxyConfigSchema.safeParse({
    ...ctx.periodsConfig,
    providers: { 'Main/A': { limits: { day: 10, month: 100 } } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['providers', 'Main/A'] });
});

test('it rejects a config with no providers', () => {
  const ctx = setupTest();
  const { providers: _providers, ...noProviders } = ctx.periodsConfig;
  const result = proxyConfigSchema.safeParse(noProviders);

  expect(result.error?.issues).toPartiallyContain({ path: ['providers'] });
});

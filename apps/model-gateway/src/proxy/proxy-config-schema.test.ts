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
      },
    },
  });

  expect(result.data?.routes['review']?.api).toBe('openai-responses');
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
    capture: null,
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'https://models.example.com',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
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

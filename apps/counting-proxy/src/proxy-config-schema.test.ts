import { expect, test } from 'bun:test';
import { proxyConfigSchema } from './proxy-config-schema';

test('it reads a config into its typed shape, with a trailing slash cut from the upstream', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { hostname: '0.0.0.0', port: 18_090 },
    store: '/var/lib/counting-proxy/counter.json',
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
    store: '/var/lib/counting-proxy/counter.json',
    limits: { dollars: 5, tokens: null },
    routes: {
      preview: {
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
    store: '/var/lib/counting-proxy/counter.json',
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
    store: '/var/lib/counting-proxy/counter.json',
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
    store: '/var/lib/counting-proxy/counter.json',
    limits: { dollars: 5 },
    routes: {},
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['routes'] });
});

test('it rejects a route with no 1-hour cache write price', () => {
  const result = proxyConfigSchema.safeParse({
    listen: { port: 18_090 },
    store: '/var/lib/counting-proxy/counter.json',
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
    store: '/var/lib/counting-proxy/counter.json',
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

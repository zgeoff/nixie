import { expect, test } from 'bun:test';
import { buildProviderOrder } from '@heynixie/wire';
import type { ProxyRoute } from '../types';
import { findBodyRefusal } from './find-body-refusal';

test('it passes the provider field that the guest builds for a pinned profile', () => {
  const route: ProxyRoute = {
    api: 'anthropic-messages',
    upstream: 'https://models.example.com',
    model: 'model-small',
    providerPin: 'example-host',
    prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    maxOutputTokens: null,
    login: null,
    limits: null,
  };

  const body = { model: 'model-small', ...buildProviderOrder('example-host') };

  expect(findBodyRefusal(body, route)).toBeNull();
});

test('it refuses the provider field that the guest builds for another pin', () => {
  const route: ProxyRoute = {
    api: 'anthropic-messages',
    upstream: 'https://models.example.com',
    model: 'model-small',
    providerPin: 'example-host',
    prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    maxOutputTokens: null,
    login: null,
    limits: null,
  };

  const body = { model: 'model-small', ...buildProviderOrder('other-host') };

  expect(findBodyRefusal(body, route)).toBeString();
});

test.each(['auto', 'default', 'priority', 'flex'])(
  'it refuses a service tier of %s on a plan route',
  (tier) => {
    const ctx = setupTest();

    expect(findBodyRefusal({ model: 'model-o', service_tier: tier }, ctx.planRoute)).toContain(
      'service_tier',
    );
  },
);

test.each([{ model: 'model-o' }, { model: 'model-o', service_tier: null }])(
  'it passes the body %j on a plan route',
  (body) => {
    const ctx = setupTest();

    expect(findBodyRefusal(body, ctx.planRoute)).toBeNull();
  },
);

test('it passes the default service tier on a route with no plan login', () => {
  const ctx = setupTest();
  const route = { ...ctx.planRoute, login: null };

  expect(findBodyRefusal({ model: 'model-o', service_tier: 'default' }, route)).toBeNull();
});

function setupTest() {
  const planRoute: ProxyRoute = {
    api: 'openai-responses',
    upstream: 'https://chatgpt.example.com/backend-api/codex',
    model: 'model-o',
    providerPin: null,
    prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
    maxOutputTokens: 1000,
    login: { file: '/var/lib/plan.json', routeKeyFile: '/run/secrets/plan-key' },
    limits: null,
  };

  return { planRoute };
}

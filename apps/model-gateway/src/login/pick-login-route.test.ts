import { expect, test } from 'bun:test';
import type { ProxyRoute } from '../types';
import { pickLoginRoute } from './pick-login-route';

test('it finds the login of a plan route', () => {
  const ctx = setupTest();
  const login = { file: '/var/lib/plan.json', routeKeyFile: '/run/secrets/plan-key' };

  expect(pickLoginRoute({ plan: { ...ctx.base, login } }, 'plan')).toStrictEqual({
    kind: 'found',
    login,
  });
});

test('it refuses a route that has no login block', () => {
  const ctx = setupTest();

  expect(pickLoginRoute({ plan: ctx.base }, 'plan')).toStrictEqual({
    kind: 'refused',
    message: expect.stringContaining('no login block'),
  });
});

test('it refuses a route the config does not name', () => {
  const ctx = setupTest();

  expect(pickLoginRoute({ plan: ctx.base }, 'other')).toStrictEqual({
    kind: 'refused',
    message: 'the config has no route other',
  });
});

function setupTest() {
  const base: ProxyRoute = {
    api: 'openai-responses',
    upstream: 'https://chatgpt.example.com',
    model: 'model-o',
    providerPin: null,
    prices: { input: 1, cacheWrite: 1, cacheWrite1h: 1, cachedInput: 1, output: 1 },
    maxOutputTokens: 1000,
    login: null,
    limits: null,
  };

  return { base };
}

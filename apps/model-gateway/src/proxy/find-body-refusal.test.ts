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
  };

  const body = { model: 'model-small', ...buildProviderOrder('other-host') };

  expect(findBodyRefusal(body, route)).toBeString();
});

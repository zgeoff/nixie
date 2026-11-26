import { expect, test } from 'bun:test';
import { buildMockGatewayStatus, buildProviderTrippedGatewayStatus } from '../test-utils';
import { collectProviderTrips } from './collect-provider-trips';

test('it collects a provider at its day limit with the routes it stops', () => {
  const status = buildProviderTrippedGatewayStatus();

  expect(collectProviderTrips(status, Date.parse('2026-11-13T16:42:07Z'))).toStrictEqual([
    {
      provider: 'main',
      routes: ['plan', 'metered'],
      period: 'day',
      start: '2026-11-13',
      limit: 100,
      spent: 101.5,
      at: Date.parse('2026-11-13T08:42:07Z'),
      resetsAt: Date.parse('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 200,
    },
  ]);
});

test('it collects no provider while each is under its limits', () => {
  expect(collectProviderTrips(buildMockGatewayStatus(), 1000)).toStrictEqual([]);
});

test('it collects no provider whose period has ended at the instant', () => {
  const status = buildProviderTrippedGatewayStatus();

  expect(collectProviderTrips(status, Date.parse('2026-11-14T00:00:00Z'))).toStrictEqual([]);
});

test('it reads a status with no providers, from an older gateway, as having none', () => {
  const status = { ...buildProviderTrippedGatewayStatus(), providers: {} };

  expect(collectProviderTrips(status, 1000)).toStrictEqual([]);
});

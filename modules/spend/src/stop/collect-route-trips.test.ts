import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockGatewayStatus, buildTrippedGatewayStatus } from '../test-utils';
import type { GatewayStatus } from '../types';
import { collectRouteTrips } from './collect-route-trips';

test('it collects no trip while every route is under its limits', () => {
  expect(collectRouteTrips(buildMockGatewayStatus(), 1000)).toStrictEqual([]);
});

test('it collects the route at its day limit with its limit, its count and the time it first reached it', () => {
  const trips = collectRouteTrips(buildTrippedGatewayStatus(), 1000);

  expect(trips).toStrictEqual([
    {
      route: 'plan',
      period: 'day',
      start: '2026-11-13',
      limit: 40,
      spent: 41.2,
      at: Date.parse('2026-11-13T08:42:07Z'),
      resetsAt: Date.parse('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 80,
    },
  ]);
});

test('it holds the day when a route reached both limits, because only the day can be raised', () => {
  const status = buildTrippedGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const both: GatewayStatus = {
    ...status,
    routes: { plan: { provider: 'main', day: plan.day, month: { ...plan.month, tripped: true } } },
  };

  expect(collectRouteTrips(both, 1000).map((trip) => trip.period)).toStrictEqual(['day']);
});

test('it cannot raise a route whose day limit is at its cap', () => {
  const status = buildTrippedGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const capped: GatewayStatus = {
    ...status,
    routes: { plan: { provider: 'main', month: plan.month, day: { ...plan.day, limit: 80 } } },
  };

  expect(collectRouteTrips(capped, 1000)[0]?.canRaise).toBe(false);
});

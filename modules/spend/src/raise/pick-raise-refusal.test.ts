import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildMockGatewayStatus } from '../test-utils';
import { pickRaiseRefusal } from './pick-raise-refusal';

test.each([
  {
    name: 'for another day',
    request: { start: '2026-11-12' },
    expected: { error: 'period_ended' },
  },
  {
    name: 'for a route the gateway does not hold',
    request: { route: 'ghost' },
    expected: { error: 'unknown_route' },
  },
  {
    name: 'above the route cap',
    request: { dollars: 80.01 },
    expected: { error: 'above_cap', measure: 'dollars', route: 'plan', provider: null, cap: 80 },
  },
  {
    name: 'above the turn cap',
    request: { turns: 2001 },
    expected: { error: 'above_cap', measure: 'turns', route: null, provider: null, cap: 2000 },
  },
  {
    name: 'at every cap',
    request: { dollars: 80, turns: 2000 },
    expected: null,
  },
])('it picks a raise $name', (row) => {
  const refusal = pickRaiseRefusal(
    buildMockGatewayStatus(),
    { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    { start: '2026-11-13', route: 'plan', dollars: 50, turns: 1500, ...row.request },
  );

  expect(refusal).toStrictEqual(row.expected);
});

test('it checks the cap of the route that the raise names, and no other', () => {
  const refusal = pickRaiseRefusal(
    buildMockGatewayStatus(),
    { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    { start: '2026-11-13', route: 'metered', dollars: 10.5 },
  );

  expect(refusal).toStrictEqual({
    error: 'above_cap',
    measure: 'dollars',
    route: 'metered',
    provider: null,
    cap: 10,
  });
});

test('it refuses a raise of a route that has no limit of its own', () => {
  const status = buildMockGatewayStatus();
  const plan = status.routes['plan'];

  invariant(plan !== undefined, 'the mock status holds the route plan');

  const refusal = pickRaiseRefusal(
    { ...status, routes: { plan: { ...plan, day: { ...plan.day, limit: null, cap: null } } } },
    { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    { start: '2026-11-13', route: 'plan', dollars: 5 },
  );

  expect(refusal).toStrictEqual({ error: 'no_route_limit', route: 'plan' });
});

test.each([
  {
    name: 'an unknown provider',
    request: { provider: 'ghost', dollars: 5 },
    expected: { error: 'unknown_provider' },
  },
  {
    name: 'a day that ended',
    request: { provider: 'main', dollars: 5, start: '2026-11-12' },
    expected: { error: 'period_ended' },
  },
  {
    name: 'a total above the provider cap',
    request: { provider: 'main', dollars: 200.5 },
    expected: { error: 'above_cap', measure: 'dollars', route: null, provider: 'main', cap: 200 },
  },
  {
    name: 'a total at the provider cap',
    request: { provider: 'main', dollars: 200 },
    expected: null,
  },
])('it picks a provider raise of $name', (row) => {
  const refusal = pickRaiseRefusal(
    buildMockGatewayStatus(),
    { dayTurns: 1000, dayTurnCap: 2000, monthTurns: 20_000 },
    { start: '2026-11-13', ...row.request },
  );

  expect(refusal).toStrictEqual(row.expected);
});

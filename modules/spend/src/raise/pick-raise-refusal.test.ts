import { expect, test } from 'bun:test';
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
    expected: { error: 'above_cap', measure: 'dollars', route: 'plan', cap: 80 },
  },
  {
    name: 'above the turn cap',
    request: { turns: 2001 },
    expected: { error: 'above_cap', measure: 'turns', route: null, cap: 2000 },
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
    cap: 10,
  });
});

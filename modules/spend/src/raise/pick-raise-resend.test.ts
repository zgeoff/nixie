import { expect, test } from 'bun:test';
import { buildMockGatewayStatus } from '../test-utils';
import type { GatewayRaise } from '../types';
import { pickRaiseResend } from './pick-raise-resend';

test.each<{ name: string; routeRaises: Record<string, number>; expected: GatewayRaise[] }>([
  { name: 'no raise', routeRaises: {}, expected: [] },
  {
    name: 'a raise above the route limit',
    routeRaises: { plan: 60 },
    expected: [{ route: 'plan', start: '2026-11-13', dollars: 60 }],
  },
  { name: 'a raise that the gateway holds', routeRaises: { plan: 40 }, expected: [] },
  {
    name: 'a raise of each route that the gateway lacks',
    routeRaises: { plan: 60, metered: 8 },
    expected: [
      { route: 'plan', start: '2026-11-13', dollars: 60 },
      { route: 'metered', start: '2026-11-13', dollars: 8 },
    ],
  },
  { name: 'a raise of a route the gateway lacks', routeRaises: { ghost: 60 }, expected: [] },
])('it picks $name', (row) => {
  const resend = pickRaiseResend(
    {
      status: buildMockGatewayStatus(),
      routeRaises: row.routeRaises,
      now: Date.parse('2026-11-13T16:42:07Z'),
    },
    'UTC',
  );

  expect(resend).toStrictEqual(row.expected);
});

test('it sends no raise of a day that the gateway has left', () => {
  const resend = pickRaiseResend(
    {
      status: buildMockGatewayStatus(),
      routeRaises: { plan: 60 },
      now: Date.parse('2026-11-14T00:00:01Z'),
    },
    'UTC',
  );

  expect(resend).toStrictEqual([]);
});

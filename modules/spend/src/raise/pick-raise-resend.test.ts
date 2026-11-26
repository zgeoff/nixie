import { expect, test } from 'bun:test';
import { buildMockGatewayStatus } from '../test-utils';
import type { GatewayRaise } from '../types';
import { pickRaiseResend } from './pick-raise-resend';

test.each<{ name: string; routeRaises: Record<string, number>; expected: GatewayRaise[] }>([
  { name: 'no raise', routeRaises: {}, expected: [] },
  {
    name: 'a raise above the route limit',
    routeRaises: { plan: 60 },
    expected: [{ target: { kind: 'route', id: 'plan' }, start: '2026-11-13', dollars: 60 }],
  },
  { name: 'a raise that the gateway holds', routeRaises: { plan: 40 }, expected: [] },
  {
    name: 'a raise of each route that the gateway lacks',
    routeRaises: { plan: 60, metered: 8 },
    expected: [
      { target: { kind: 'route', id: 'plan' }, start: '2026-11-13', dollars: 60 },
      { target: { kind: 'route', id: 'metered' }, start: '2026-11-13', dollars: 8 },
    ],
  },
  { name: 'a raise of a route the gateway lacks', routeRaises: { ghost: 60 }, expected: [] },
])('it picks $name', (row) => {
  const resend = pickRaiseResend(
    {
      status: buildMockGatewayStatus(),
      routeRaises: row.routeRaises,
      providerRaises: {},
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
      providerRaises: {},
      now: Date.parse('2026-11-14T00:00:01Z'),
    },
    'UTC',
  );

  expect(resend).toStrictEqual([]);
});

test.each<{ name: string; providerRaises: Record<string, number>; expected: GatewayRaise[] }>([
  {
    name: 'a raise above the provider limit',
    providerRaises: { main: 150 },
    expected: [{ target: { kind: 'provider', id: 'main' }, start: '2026-11-13', dollars: 150 }],
  },
  { name: 'a raise that the gateway holds', providerRaises: { main: 100 }, expected: [] },
  { name: 'a raise of a provider the gateway lacks', providerRaises: { ghost: 150 }, expected: [] },
])('it picks $name of a provider', (row) => {
  const resend = pickRaiseResend(
    {
      status: buildMockGatewayStatus(),
      routeRaises: {},
      providerRaises: row.providerRaises,
      now: Date.parse('2026-11-13T16:42:07Z'),
    },
    'UTC',
  );

  expect(resend).toStrictEqual(row.expected);
});

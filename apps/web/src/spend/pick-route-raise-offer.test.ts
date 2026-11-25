import { expect, test } from 'bun:test';
import type { SpendRouteTrip } from '../types';
import { pickRouteRaiseOffer } from './pick-route-raise-offer';

function setupTest() {
  return {
    buildTrip: (overrides: Partial<SpendRouteTrip>): SpendRouteTrip => ({
      route: 'plan',
      period: 'day',
      start: '2026-11-13',
      limit: 40,
      spent: 41.2,
      at: new Date('2026-11-13T16:42:07Z'),
      resetsAt: new Date('2026-11-14T00:00:00Z'),
      canRaise: true,
      cap: 80,
      ...overrides,
    }),
  };
}

test.each([
  { name: 'the dollars raised by half', trip: {}, expected: { dollars: 60 } },
  { name: 'a raise held at the cap', trip: { limit: 70 }, expected: { dollars: 80 } },
  { name: 'whole cents', trip: { limit: 0.333 }, expected: { dollars: 0.5 } },
])('it offers $name', (row) => {
  const ctx = setupTest();

  expect(pickRouteRaiseOffer(ctx.buildTrip(row.trip))).toStrictEqual(row.expected);
});

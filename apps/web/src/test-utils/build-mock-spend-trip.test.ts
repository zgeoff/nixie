import { expect, test } from 'bun:test';
import { buildMockSpendTrip } from './build-mock-spend-trip';

test('it builds a day trip by dollars that can be raised', () => {
  expect(buildMockSpendTrip()).toMatchObject({ state: 'tripped', period: 'day', canRaise: true });
});

test('it takes an override', () => {
  expect(buildMockSpendTrip({ period: 'month' }).period).toBe('month');
});

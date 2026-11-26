import { expect, test } from 'bun:test';
import { buildMockSpendTrip } from '../test-utils/build-mock-spend-trip';
import { pickRaiseOffer } from './pick-raise-offer';

test.each([
  { name: 'the turns raised by half', trip: {}, expected: { turns: 1500 } },
  { name: 'a raise held at the cap', trip: { limit: 1800 }, expected: { turns: 2000 } },
  { name: 'turns above the cap held at the cap', trip: { limit: 3000 }, expected: { turns: 2000 } },
])('it offers $name', (row) => {
  expect(pickRaiseOffer(buildMockSpendTrip(row.trip))).toStrictEqual(row.expected);
});

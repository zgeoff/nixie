import { expect, test } from 'bun:test';
import { pickNextMidnight } from './pick-next-midnight';

test.each([
  ['Australia/Sydney', '2026-11-13T02:30:00Z', '2026-11-13T13:00:00.000Z'],
  ['UTC', '2026-11-13T23:59:00Z', '2026-11-14T00:00:00.000Z'],
  ['UTC', '2026-11-14T00:00:00Z', '2026-11-15T00:00:00.000Z'],
  ['America/New_York', '2026-03-07T20:00:00Z', '2026-03-08T05:00:00.000Z'],
  ['America/New_York', '2026-03-08T20:00:00Z', '2026-03-09T04:00:00.000Z'],
])('it picks the next midnight in %s after %s', (zone, at, expected) => {
  const midnight = pickNextMidnight(Date.parse(at), zone);

  expect(new Date(midnight).toISOString()).toBe(expected);
});

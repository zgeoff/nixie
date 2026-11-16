import { expect, test } from 'bun:test';
import { buildOffsetAt } from './build-offset-at';

test.each([
  ['2027-03-12T08:00:00Z', 'Europe/Paris', '2027-03-12T08:00:00Z'],
  ['2027-03-12T08:00:00+05:30', 'Europe/Paris', '2027-03-12T08:00:00+05:30'],
  ['2027-03-12T08:00', 'Europe/Paris', '2027-03-12T08:00:00+01:00'],
  ['2027-07-12T08:00:30', 'Europe/Paris', '2027-07-12T08:00:30+02:00'],
  ['2027-03-12T08:00', 'America/New_York', '2027-03-12T08:00:00-05:00'],
  ['2027-03-12T08:00', 'Asia/Kolkata', '2027-03-12T08:00:00+05:30'],
  ['2027-03-28T02:30', 'Europe/Paris', '2027-03-28T03:00:00+02:00'],
])('#buildOffsetAt reads %s in %s as %s', (at, zone, expected) => {
  expect(buildOffsetAt(at, zone)).toBe(expected);
});

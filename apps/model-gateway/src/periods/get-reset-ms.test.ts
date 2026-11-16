import { expect, test } from 'bun:test';
import { getResetMs } from './get-reset-ms';

test.each([
  ['day', '2026-11-13', 'Europe/London', '2026-11-14T00:00:00.000Z'],
  ['day', '2026-06-13', 'Europe/London', '2026-06-13T23:00:00.000Z'],
  ['month', '2026-11-01', 'Europe/London', '2026-12-01T00:00:00.000Z'],
  ['month', '2026-12-01', 'Asia/Tokyo', '2026-12-31T15:00:00.000Z'],
  ['day', '2026-12-31', 'America/Los_Angeles', '2027-01-01T08:00:00.000Z'],
] as const)(
  '#getResetMs resets the %s that starts %s in %s at %s',
  (period, start, zone, expected) => {
    expect(new Date(getResetMs(period, start, zone)).toISOString()).toBe(expected);
  },
);

test('#getResetMs ends a day of a clock change 25 hours after the previous midnight', () => {
  const dayStart = getResetMs('day', '2026-10-24', 'Europe/London');
  const dayEnd = getResetMs('day', '2026-10-25', 'Europe/London');

  expect(dayEnd - dayStart).toBe(25 * 3_600_000);
});

test('#getResetMs ends a day of a spring clock change 23 hours after the previous midnight', () => {
  const dayStart = getResetMs('day', '2026-03-28', 'Europe/London');
  const dayEnd = getResetMs('day', '2026-03-29', 'Europe/London');

  expect(dayEnd - dayStart).toBe(23 * 3_600_000);
});

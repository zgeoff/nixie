import { expect, test } from 'bun:test';
import { formatMemoryDay } from './format-memory-day';

test('it leaves the year out of a day in the current year', () => {
  expect(
    formatMemoryDay(Date.parse('2026-10-13T09:30:00Z'), {
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
    }),
  ).toBe('13 Oct');
});

test('it shows the year of a day in a past year', () => {
  expect(
    formatMemoryDay(Date.parse('2025-10-13T09:30:00Z'), {
      defaultZone: 'UTC',
      now: new Date('2026-10-14T12:00:00Z'),
    }),
  ).toBe('13 Oct 2025');
});

test('it reads the day in the default zone', () => {
  expect(
    formatMemoryDay(Date.parse('2026-10-13T23:30:00Z'), {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-14T12:00:00Z'),
    }),
  ).toBe('14 Oct');
});

test('it takes the current year from the default zone', () => {
  expect(
    formatMemoryDay(Date.parse('2027-01-01T02:00:00Z'), {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-12-31T20:00:00Z'),
    }),
  ).toBe('1 Jan');
});

import { expect, test } from 'bun:test';
import { formatTypedTime } from './format-typed-time';

test('it formats only the time for a message typed on the day it was sent', () => {
  expect(
    formatTypedTime(
      new Date('2026-10-13T21:12:00Z'),
      new Date('2026-10-14T07:36:00Z'),
      'Australia/Sydney',
      { defaultZone: 'UTC', now: new Date('2026-10-14T08:00:00Z') },
    ),
  ).toBe('08:12');
});

test('it formats the day and the time for a message typed on an earlier day', () => {
  expect(
    formatTypedTime(
      new Date('2026-10-13T11:40:00Z'),
      new Date('2026-10-14T07:36:00Z'),
      'Australia/Sydney',
      { defaultZone: 'UTC', now: new Date('2026-10-14T08:00:00Z') },
    ),
  ).toBe('Tue 13 Oct, 22:40');
});

test('it formats the year for a message typed in an earlier year', () => {
  expect(
    formatTypedTime(
      new Date('2025-12-31T10:00:00Z'),
      new Date('2026-01-01T02:00:00Z'),
      'Europe/London',
      { defaultZone: 'UTC', now: new Date('2026-01-01T03:00:00Z') },
    ),
  ).toBe('Wed 31 Dec 2025, 10:00');
});

test('it formats the time in the default zone when the message names an unknown zone', () => {
  expect(
    formatTypedTime(
      new Date('2026-10-14T01:00:00Z'),
      new Date('2026-10-14T09:00:00Z'),
      'Atlantis/Poseidonia',
      { defaultZone: 'Europe/London', now: new Date('2026-10-14T10:00:00Z') },
    ),
  ).toBe('02:00');
});

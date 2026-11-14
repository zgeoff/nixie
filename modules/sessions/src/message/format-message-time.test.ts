import { expect, test } from 'bun:test';
import { formatMessageTime } from './format-message-time';

test('it formats the send time in the zone given', () => {
  expect(
    formatMessageTime(new Date('2026-10-13T13:05:00Z'), 'Europe/London', {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T15:00:00Z'),
    }),
  ).toBe('Tue 13 Oct, 14:05, London');
});

test('it formats the send time in the default zone when no zone is given', () => {
  expect(
    formatMessageTime(new Date('2026-10-13T03:05:00Z'), undefined, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('Tue 13 Oct, 14:05, Sydney');
});

test('it formats the send time in the default zone when the zone is one this runtime does not know', () => {
  expect(
    formatMessageTime(new Date('2026-10-13T03:05:00Z'), 'Atlantis/Poseidonia', {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('Tue 13 Oct, 14:05, Sydney');
});

test('it adds the year to a message sent in a past year', () => {
  expect(
    formatMessageTime(new Date('2025-10-14T03:05:00Z'), undefined, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('Tue 14 Oct 2025, 14:05, Sydney');
});

test('it leaves out the year for a message sent this year in its zone, though UTC was still in the year before', () => {
  expect(
    formatMessageTime(new Date('2025-12-31T13:30:00Z'), undefined, {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T05:00:00Z'),
    }),
  ).toBe('Thu 1 Jan, 00:30, Sydney');
});

test('it names a zone whose city has a space with the space', () => {
  expect(
    formatMessageTime(new Date('2026-10-13T18:05:00Z'), 'America/New_York', {
      defaultZone: 'Australia/Sydney',
      now: new Date('2026-10-13T20:00:00Z'),
    }),
  ).toBe('Tue 13 Oct, 14:05, New York');
});

import { expect, test } from 'bun:test';
import { formatOutboxAge } from './format-outbox-age';

const now = Date.parse('2026-10-17T12:00:00.000Z');

test('it formats an age under an hour in minutes', () => {
  expect(formatOutboxAge('2026-10-17T11:55:30.000Z', now)).toBe('written 4 min ago');
});

test('it formats an age under a day in hours', () => {
  expect(formatOutboxAge('2026-10-17T09:00:00.000Z', now)).toBe('written 3 h ago');
});

test('it formats an age of a day or more in days', () => {
  expect(formatOutboxAge('2026-10-15T11:00:00.000Z', now)).toBe('written 2 d ago');
});

test('it formats a message with no written time as written earlier', () => {
  expect(formatOutboxAge(undefined, now)).toBe('written earlier');
});

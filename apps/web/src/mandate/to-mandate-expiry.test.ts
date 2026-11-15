import { expect, test } from 'bun:test';
import { toMandateExpiry } from './to-mandate-expiry';

test('it leaves the default when the field is empty', () => {
  expect(toMandateExpiry('  ')).toBeUndefined();
});

test('it leaves the default when the text is not a date', () => {
  expect(toMandateExpiry('soon')).toBeUndefined();
});

test('it gives an instant with an offset for a local date and time', () => {
  const instant = toMandateExpiry('2026-11-02T18:30');

  expect(instant).toStrictEqual(new Date('2026-11-02T18:30').toISOString());
});

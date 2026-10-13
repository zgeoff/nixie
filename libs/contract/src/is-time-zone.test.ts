import { expect, test } from 'bun:test';
import { isTimeZone } from './is-time-zone';

test('it knows an IANA time zone', () => {
  expect(isTimeZone('Europe/London')).toBeTrue();
});

test('it refuses a name that is no time zone', () => {
  expect(isTimeZone('Atlantis/Poseidonia')).toBeFalse();
});

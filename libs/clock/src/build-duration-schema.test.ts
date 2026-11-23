import { expect, test } from 'bun:test';
import { buildDurationSchema } from './build-duration-schema';

test('it reads a valid duration as milliseconds', () => {
  expect(buildDurationSchema('5s').parse('10m')).toBe(600_000);
});

test('it rejects an invalid duration', () => {
  expect(buildDurationSchema('5s').safeParse('soon').success).toBeFalse();
});

test('it reads the fallback when the value is missing', () => {
  expect(buildDurationSchema('24h').parse(undefined)).toBe(86_400_000);
});

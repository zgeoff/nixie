import { expect, test } from 'bun:test';
import { timeConfigSchema } from './time-config-schema';

test('it defaults the zone to Australia/Sydney', () => {
  expect(timeConfigSchema.parse({})).toStrictEqual({ default_zone: 'Australia/Sydney' });
});

test('it takes a configured IANA zone', () => {
  expect(timeConfigSchema.parse({ default_zone: 'Europe/London' })).toStrictEqual({
    default_zone: 'Europe/London',
  });
});

test('it refuses a zone that is no IANA time zone', () => {
  expect(timeConfigSchema.safeParse({ default_zone: 'Atlantis/Poseidonia' }).success).toBeFalse();
});

test('it takes a zone whose offset is 45 minutes past the hour', () => {
  expect(timeConfigSchema.parse({ default_zone: 'Asia/Kathmandu' })).toStrictEqual({
    default_zone: 'Asia/Kathmandu',
  });
});

test('it refuses a zone whose offset is not a whole number of 15 minutes', () => {
  const result = timeConfigSchema.safeParse({ default_zone: '+00:01' });

  expect(result.error?.issues.map((issue) => issue.message)).toStrictEqual([
    'expected a zone whose offset from UTC is a whole number of 15 minutes',
  ]);
});

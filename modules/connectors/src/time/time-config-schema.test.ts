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

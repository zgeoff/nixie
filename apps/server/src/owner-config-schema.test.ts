import { expect, test } from 'bun:test';
import { ownerConfigSchema } from './owner-config-schema';

test("it reads the owner's name and time zone", () => {
  const result = ownerConfigSchema.safeParse({ name: 'Avery', time_zone: 'Europe/London' });

  expect(result.data).toStrictEqual({ name: 'Avery', timeZone: 'Europe/London' });
});

test('it reads no name and UTC when the section sets neither', () => {
  const result = ownerConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({ name: null, timeZone: 'UTC' });
});

test('it refuses a time zone that is not an IANA zone', () => {
  const result = ownerConfigSchema.safeParse({ name: 'Avery', time_zone: 'Mars/Olympus_Mons' });

  expect(result.error?.issues).toPartiallyContain({ path: ['time_zone'] });
});

test('it refuses an empty name', () => {
  const result = ownerConfigSchema.safeParse({ name: '', time_zone: 'Europe/London' });

  expect(result.error?.issues).toPartiallyContain({ path: ['name'] });
});

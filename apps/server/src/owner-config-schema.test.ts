import { expect, test } from 'bun:test';
import { ownerConfigSchema } from './owner-config-schema';

test("it reads the owner's name", () => {
  const result = ownerConfigSchema.safeParse({ name: 'Avery' });

  expect(result.data).toStrictEqual({ name: 'Avery' });
});

test('it reads no name when the section sets none', () => {
  const result = ownerConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({ name: null });
});

test('it refuses an empty name', () => {
  const result = ownerConfigSchema.safeParse({ name: '' });

  expect(result.error?.issues).toPartiallyContain({ path: ['name'] });
});

test('it refuses a key the section does not have', () => {
  const result = ownerConfigSchema.safeParse({ name: 'Avery', time_zone: 'Europe/London' });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});

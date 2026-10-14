import { expect, test } from 'bun:test';
import { ownerConfigSchema } from './owner-config-schema';

test("it reads the owner's name and pronouns", () => {
  const result = ownerConfigSchema.safeParse({
    name: 'Avery',
    pronouns: { they: 'she', their: 'her' },
  });

  expect(result.data).toStrictEqual({ name: 'Avery', pronouns: { they: 'she', their: 'her' } });
});

test('it reads no name and they and their when the section sets neither', () => {
  const result = ownerConfigSchema.safeParse({});

  expect(result.data).toStrictEqual({ name: null, pronouns: { they: 'they', their: 'their' } });
});

test('it refuses an empty name', () => {
  const result = ownerConfigSchema.safeParse({ name: '' });

  expect(result.error?.issues).toPartiallyContain({ path: ['name'] });
});

test('it refuses pronouns that leave one out', () => {
  const result = ownerConfigSchema.safeParse({ pronouns: { they: 'he' } });

  expect(result.error?.issues).toPartiallyContain({ path: ['pronouns', 'their'] });
});

test('it refuses an empty pronoun', () => {
  const result = ownerConfigSchema.safeParse({ pronouns: { they: '', their: 'his' } });

  expect(result.error?.issues).toPartiallyContain({ path: ['pronouns', 'they'] });
});

test('it refuses a key the section does not have', () => {
  const result = ownerConfigSchema.safeParse({ name: 'Avery', time_zone: 'Europe/London' });

  expect(result.error?.issues).toPartiallyContain({ code: 'unrecognized_keys' });
});

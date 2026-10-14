import { expect, test } from 'bun:test';
import { defaultOwnerPronouns } from '@heynixie/memory';
import { resolveOwnerConfig } from './resolve-owner-config';

const pronouns = { they: 'they', their: 'their' };

test("it reads the owner's name from the settings entry that the reference names, and keeps the pronouns", () => {
  expect(
    resolveOwnerConfig(
      { name: 'deployment:owner_name', pronouns: { they: 'he', their: 'his' } },
      { owner_name: 'Wren Halloway' },
    ),
  ).toStrictEqual({ name: 'Wren Halloway', pronouns: { they: 'he', their: 'his' } });
});

test('it reads each pronoun from the settings entry that its reference names', () => {
  expect(
    resolveOwnerConfig(
      {
        name: 'Avery',
        pronouns: { they: 'deployment:owner_they', their: 'deployment:owner_their' },
      },
      { owner_they: 'she', owner_their: 'her' },
    ),
  ).toStrictEqual({ name: 'Avery', pronouns: { they: 'she', their: 'her' } });
});

test('it keeps plain pronouns beside a referenced name', () => {
  expect(
    resolveOwnerConfig(
      { name: 'deployment:owner_name', pronouns: { they: 'xe', their: 'xyr' } },
      { owner_name: 'Wren Halloway', owner_they: 'she' },
    ),
  ).toStrictEqual({ name: 'Wren Halloway', pronouns: { they: 'xe', their: 'xyr' } });
});

test('it keeps the default they and their', () => {
  expect(
    resolveOwnerConfig({ name: null, pronouns: defaultOwnerPronouns }, { they: 'he' }),
  ).toStrictEqual({ name: null, pronouns: { they: 'they', their: 'their' } });
});

test('it keeps a plain name', () => {
  expect(
    resolveOwnerConfig({ name: 'Avery', pronouns }, { owner_name: 'Wren Halloway' }),
  ).toStrictEqual({ name: 'Avery', pronouns });
});

test('it keeps no name when the configuration sets none', () => {
  expect(
    resolveOwnerConfig({ name: null, pronouns }, { owner_name: 'Wren Halloway' }),
  ).toStrictEqual({ name: null, pronouns });
});

test('it refuses a reference that names an inherited property, not a settings entry', () => {
  expect(() =>
    resolveOwnerConfig({ name: 'deployment:toString', pronouns }, {}),
  ).toThrowWithMessage(
    Error,
    "the owner's name is deployment:toString, and the secrets file has no settings entry toString",
  );
});

test('it refuses a reference whose settings entry is missing', () => {
  expect(() =>
    resolveOwnerConfig(
      { name: 'deployment:owner_name', pronouns },
      { other_name: 'Wren Halloway' },
    ),
  ).toThrowWithMessage(
    Error,
    "the owner's name is deployment:owner_name, and the secrets file has no settings entry owner_name",
  );
});

test('it refuses a pronoun reference whose settings entry is missing', () => {
  expect(() =>
    resolveOwnerConfig(
      { name: 'Avery', pronouns: { they: 'they', their: 'deployment:owner_their' } },
      { owner_they: 'she' },
    ),
  ).toThrowWithMessage(
    Error,
    "the owner's pronoun their is deployment:owner_their, and the secrets file has no settings entry owner_their",
  );
});

test('it refuses a they reference whose settings entry is missing', () => {
  expect(() =>
    resolveOwnerConfig(
      { name: null, pronouns: { they: 'deployment:owner_they', their: 'their' } },
      {},
    ),
  ).toThrowWithMessage(
    Error,
    "the owner's pronoun they is deployment:owner_they, and the secrets file has no settings entry owner_they",
  );
});

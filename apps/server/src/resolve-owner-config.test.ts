import { expect, test } from 'bun:test';
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

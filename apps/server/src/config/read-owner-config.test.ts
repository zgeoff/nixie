import { expect, test } from 'bun:test';
import type { SecretsFile } from '@heynixie/credentials';
import { MissingCredentialError, readSetting } from '@heynixie/credentials';
import { defaultOwnerPronouns } from '@heynixie/memory';
import { readOwnerConfig } from './read-owner-config';

function setupTest(settings: Readonly<Record<string, string>>) {
  const file: SecretsFile = {
    deployment_key: 'not-a-real-key',
    model_credentials: {},
    connector_credentials: {},
    settings,
  };

  return { read: (reference: string) => readSetting(file, reference) };
}

test("it reads the owner's name from the settings entry that the reference names, and keeps the pronouns", () => {
  const ctx = setupTest({ owner_name: 'Wren Halloway' });

  expect(
    readOwnerConfig(
      { name: 'deployment:owner_name', pronouns: { they: 'he', their: 'his' } },
      ctx.read,
    ),
  ).toStrictEqual({ name: 'Wren Halloway', pronouns: { they: 'he', their: 'his' } });
});

test('it reads each pronoun from the settings entry that its reference names', () => {
  const ctx = setupTest({ owner_they: 'she', owner_their: 'her' });

  expect(
    readOwnerConfig(
      {
        name: 'Avery',
        pronouns: { they: 'deployment:owner_they', their: 'deployment:owner_their' },
      },
      ctx.read,
    ),
  ).toStrictEqual({ name: 'Avery', pronouns: { they: 'she', their: 'her' } });
});

test('it keeps plain pronouns beside a referenced name', () => {
  const ctx = setupTest({ owner_name: 'Wren Halloway', owner_they: 'she' });

  expect(
    readOwnerConfig(
      { name: 'deployment:owner_name', pronouns: { they: 'xe', their: 'xyr' } },
      ctx.read,
    ),
  ).toStrictEqual({ name: 'Wren Halloway', pronouns: { they: 'xe', their: 'xyr' } });
});

test('it keeps the default they and their', () => {
  const ctx = setupTest({ they: 'he' });

  expect(readOwnerConfig({ name: null, pronouns: defaultOwnerPronouns }, ctx.read)).toStrictEqual({
    name: null,
    pronouns: { they: 'they', their: 'their' },
  });
});

test('it keeps a plain name', () => {
  const ctx = setupTest({ owner_name: 'Wren Halloway' });
  const pronouns = { they: 'they', their: 'their' };

  expect(readOwnerConfig({ name: 'Avery', pronouns }, ctx.read)).toStrictEqual({
    name: 'Avery',
    pronouns,
  });
});

test('it keeps no name when the configuration sets none', () => {
  const ctx = setupTest({ owner_name: 'Wren Halloway' });
  const pronouns = { they: 'they', their: 'their' };

  expect(readOwnerConfig({ name: null, pronouns }, ctx.read)).toStrictEqual({
    name: null,
    pronouns,
  });
});

test('it refuses a reference that names an inherited property, not a settings entry', () => {
  const ctx = setupTest({});
  const pronouns = { they: 'they', their: 'their' };

  expect(() => readOwnerConfig({ name: 'deployment:toString', pronouns }, ctx.read)).toThrow(
    MissingCredentialError,
  );
});

test('it refuses a reference whose settings entry is missing, and names it', () => {
  const ctx = setupTest({ other_name: 'Wren Halloway' });
  const pronouns = { they: 'they', their: 'their' };

  expect(() => readOwnerConfig({ name: 'deployment:owner_name', pronouns }, ctx.read)).toThrow(
    'deployment:owner_name names a setting, and the secrets file has no settings entry owner_name',
  );
});

test('it refuses a pronoun reference whose settings entry is missing', () => {
  const ctx = setupTest({ owner_they: 'she' });

  expect(() =>
    readOwnerConfig(
      { name: 'Avery', pronouns: { they: 'they', their: 'deployment:owner_their' } },
      ctx.read,
    ),
  ).toThrow('deployment:owner_their names a setting');
});

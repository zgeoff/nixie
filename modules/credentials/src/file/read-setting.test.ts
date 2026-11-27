import { expect, test } from 'bun:test';
import type { SecretsFile } from '../types';
import { MissingCredentialError } from './missing-credential-error';
import { readSetting } from './read-setting';

function setupTest() {
  return {
    buildFile: (settings: Readonly<Record<string, string>>): SecretsFile => ({
      deployment_key: 'not-a-real-key',
      model_credentials: {},
      connector_credentials: {},
      settings,
    }),
  };
}

test('it returns the value of a settings entry', () => {
  const ctx = setupTest();
  const file = ctx.buildFile({ 'owner-name': 'Wren Halloway' });

  expect(readSetting(file, 'deployment:owner-name')).toBe('Wren Halloway');
});

test('it stops with MissingCredentialError for an entry the file lacks', () => {
  const ctx = setupTest();
  const file = ctx.buildFile({ 'owner-name': 'Wren Halloway' });

  expect(() => readSetting(file, 'deployment:pronoun')).toThrow(MissingCredentialError);
});

test('it names the config key in the error for an entry the file lacks, as a credential does', () => {
  const ctx = setupTest();
  const file = ctx.buildFile({ 'owner-name': 'Wren Halloway' });

  expect(() => readSetting(file, 'deployment:phone_number', 'phone.number')).toThrowWithMessage(
    MissingCredentialError,
    'phone.number is deployment:phone_number, and the secrets file has no settings entry phone_number',
  );
});

test('it returns the value of a settings entry for a call that passes the config key', () => {
  const ctx = setupTest();
  const file = ctx.buildFile({ 'owner-name': 'Wren Halloway' });

  expect(readSetting(file, 'deployment:owner-name', 'owner.name')).toBe('Wren Halloway');
});

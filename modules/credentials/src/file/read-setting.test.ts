import { expect, test } from 'bun:test';
import type { SecretsFile } from '../types';
import { MissingCredentialError } from './missing-credential-error';
import { readSetting } from './read-setting';

function setupTest() {
  const file: SecretsFile = {
    deployment_key: 'not-a-real-key',
    model_credentials: {},
    connector_credentials: {},
    settings: { 'owner-name': 'Wren Halloway' },
  };

  return { file };
}

test('it returns the value of a settings entry', () => {
  const ctx = setupTest();

  expect(readSetting(ctx.file, 'deployment:owner-name')).toBe('Wren Halloway');
});

test('it stops with MissingCredentialError for an entry the file lacks', () => {
  const ctx = setupTest();

  expect(() => readSetting(ctx.file, 'deployment:pronoun')).toThrow(MissingCredentialError);
});

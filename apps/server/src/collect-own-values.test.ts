import { expect, test } from 'bun:test';
import { collectOwnValues } from './collect-own-values';

function setupTest() {
  return {
    secrets: {
      deployment_key: 'a-long-deployment-key',
      impd_token: 'impd-token-value',
      model_credentials: { anthropic: 'model-credential-1', short: 'tiny' },
      connector_credentials: { 'mail-account-name': 'connector-secret-1' },
      settings: { owner_name: 'Longname Ownername' },
    },
  };
}

test('it reads each string and each map value but never a map key', () => {
  const ctx = setupTest();

  expect(collectOwnValues(ctx.secrets)).toStrictEqual([
    'a-long-deployment-key',
    'impd-token-value',
    'model-credential-1',
    'connector-secret-1',
  ]);
});

test('it leaves out a value shorter than 8 characters', () => {
  const ctx = setupTest();

  expect(collectOwnValues(ctx.secrets)).not.toContain('tiny');
});

test('it leaves out the settings entry by default', () => {
  const ctx = setupTest();

  expect(collectOwnValues(ctx.secrets)).not.toContain('Longname Ownername');
});

test('it reads the entries a caller lists', () => {
  const ctx = setupTest();

  expect(collectOwnValues(ctx.secrets, { entries: ['settings'], minChars: 3 })).toStrictEqual([
    'Longname Ownername',
  ]);
});

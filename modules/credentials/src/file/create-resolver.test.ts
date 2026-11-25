import { expect, test } from 'bun:test';
import type { SecretsFile } from '../types';
import { createResolver } from './create-resolver';
import { MissingCredentialError } from './missing-credential-error';

function setupTest() {
  const file: SecretsFile = {
    deployment_key: 'not-a-real-key',
    model_credentials: { anthropic: 'fake-model-value' },
    connector_credentials: { kagi: 'fake-search-value', 'example.v2': 'fake-dotted-value' },
    settings: { spend: 'fake-spend-value' },
  };

  return { resolveCredential: createResolver(file) };
}

test.each([
  {
    title: 'a model entry',
    query: { class: 'model', reference: 'deployment:anthropic' },
    ref: { backend: 'file', group: 'model_credentials', name: 'anthropic' },
  },
  {
    title: 'a connector entry',
    query: { class: 'connector', reference: 'deployment:kagi' },
    ref: { backend: 'file', group: 'connector_credentials', name: 'kagi' },
  },
  {
    title: 'a connector entry whose name holds a dot',
    query: { class: 'connector', reference: 'deployment:example.v2' },
    ref: { backend: 'file', group: 'connector_credentials', name: 'example.v2' },
  },
  {
    title: 'a setting',
    query: { class: 'setting', reference: 'deployment:spend' },
    ref: { backend: 'file', group: 'settings', name: 'spend' },
  },
] as const)('it resolves $title to a reference of the file backend', (row) => {
  const ctx = setupTest();

  expect(ctx.resolveCredential(row.query)).toStrictEqual(row.ref);
});

test('it resolves a missing model entry to null', () => {
  const ctx = setupTest();

  expect(ctx.resolveCredential({ class: 'model', reference: 'deployment:openai' })).toBeNull();
});

test('it stops with MissingCredentialError for a missing connector entry, naming the config key', () => {
  const ctx = setupTest();

  expect(() =>
    ctx.resolveCredential({
      class: 'connector',
      reference: 'deployment:absent',
      configKey: 'search.credential',
    }),
  ).toThrowWithMessage(
    MissingCredentialError,
    'search.credential is deployment:absent, and the secrets file has no connector_credentials entry absent',
  );
});

test('it stops with MissingCredentialError for a missing setting entry', () => {
  const ctx = setupTest();

  expect(() => ctx.resolveCredential({ class: 'setting', reference: 'deployment:absent' })).toThrow(
    MissingCredentialError,
  );
});

test('it never resolves a name that only the object prototype holds', () => {
  const ctx = setupTest();

  expect(ctx.resolveCredential({ class: 'model', reference: 'deployment:constructor' })).toBeNull();
});

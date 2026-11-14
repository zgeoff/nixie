import { expect, test } from 'bun:test';
import { buildSandboxManifest } from './build-sandbox-manifest.ts';

test('it prints each key with its ref in key order', () => {
  expect(
    buildSandboxManifest({
      fetch: 'registry.test/nixie-fetch@sha256:bb22',
      conversation: 'registry.test/nixie-conversation@sha256:aa11',
    }),
  ).toBe(
    '{"conversation":"registry.test/nixie-conversation@sha256:aa11","fetch":"registry.test/nixie-fetch@sha256:bb22"}',
  );
});

test('it refuses a key with no ref, naming the key', () => {
  expect(() =>
    buildSandboxManifest({ conversation: 'registry.test/nixie-conversation@sha256:aa11' }),
  ).toThrow('fetch');
});

test('it refuses a ref with no key, naming the key', () => {
  expect(() =>
    buildSandboxManifest({
      conversation: 'registry.test/nixie-conversation@sha256:aa11',
      fetch: 'registry.test/nixie-fetch@sha256:bb22',
      extra: 'registry.test/nixie-extra@sha256:cc33',
    }),
  ).toThrow('extra');
});

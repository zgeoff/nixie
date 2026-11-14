import { expect, test } from 'bun:test';
import { parseSandboxManifest } from './read-sandbox-manifest.ts';

test('it gives each key with its ref', () => {
  expect(
    parseSandboxManifest('{"conversation":"r/a@sha256:aa11","fetch":"r/b@sha256:bb22"}'),
  ).toStrictEqual({
    conversation: 'r/a@sha256:aa11',
    fetch: 'r/b@sha256:bb22',
  });
});

test('it refuses a value that is no ref', () => {
  expect(() => parseSandboxManifest('{"fetch":1}')).toThrow('fetch');
});

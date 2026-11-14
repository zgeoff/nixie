import { expect, test } from 'bun:test';
import { getSandboxImage } from './get-sandbox-image';

function setupTest() {
  return { fetch: { name: 'nixie-fetch-bbbbbbbbbbbb', ref: 'r/f@sha256:bb' } };
}

test('it gives the image under the key', () => {
  const ctx = setupTest();

  expect(getSandboxImage({ fetch: ctx.fetch }, 'fetch')).toStrictEqual(ctx.fetch);
});

test('it throws an error naming a key the images lack', () => {
  const ctx = setupTest();

  expect(() => getSandboxImage({ fetch: ctx.fetch }, 'conversation')).toThrow(
    'the sandbox manifest holds no conversation image',
  );
});

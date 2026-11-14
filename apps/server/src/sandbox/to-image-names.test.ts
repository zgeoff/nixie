import { expect, test } from 'bun:test';
import { toImageNames } from './to-image-names';

test('it keys each image name by its key in the sandbox manifest', () => {
  expect(
    toImageNames({
      conversation: {
        name: 'nixie-conversation-0123456789ab',
        ref: 'registry.test/conversation:1',
      },
      fetch: { name: 'nixie-fetch-0123456789ab', ref: 'registry.test/fetch:1' },
    }),
  ).toStrictEqual({
    conversation: 'nixie-conversation-0123456789ab',
    fetch: 'nixie-fetch-0123456789ab',
  });
});

test('it leaves out an image that the manifest lacks', () => {
  expect(
    toImageNames({ fetch: { name: 'nixie-fetch-0123456789ab', ref: 'registry.test/fetch:1' } }),
  ).toStrictEqual({ fetch: 'nixie-fetch-0123456789ab' });
});

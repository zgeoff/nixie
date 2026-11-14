import { expect, test } from 'bun:test';
import { modelCompactedCodec } from './model-compacted-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelCompactedCodec.encode({
    trigger: 'auto',
    preTokens: 384_000,
    postTokens: 42_000,
    recalledThrough: 12,
  });

  expect(modelCompactedCodec.decode(payload)).toStrictEqual({
    trigger: 'auto',
    preTokens: 384_000,
    postTokens: 42_000,
    recalledThrough: 12,
  });
});

test('it refuses a trigger the CLI never compacted on', () => {
  expect(() =>
    modelCompactedCodec.decode({
      trigger: 'threshold',
      preTokens: 384_000,
      postTokens: null,
      recalledThrough: 12,
    }),
  ).toThrow(/"path": \[\s+"trigger"\s+\]/u);
});

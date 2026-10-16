import { expect, test } from 'bun:test';
import { modelCompactionFailedCodec } from './model-compaction-failed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelCompactionFailedCodec.encode({
    model: 'claude-test-1',
    profile: 'chat-direct',
    trigger: 'overflow',
    failures: 2,
    contextSize: 199_000,
  });

  expect(modelCompactionFailedCodec.decode(payload)).toStrictEqual({
    model: 'claude-test-1',
    profile: 'chat-direct',
    trigger: 'overflow',
    failures: 2,
    contextSize: 199_000,
  });
});

test('it refuses a failure count below one', () => {
  expect(() =>
    modelCompactionFailedCodec.decode({
      model: 'claude-test-1',
      profile: 'chat-direct',
      trigger: 'overflow',
      failures: 0,
    }),
  ).toThrow(/"path": \[\s+"failures"\s+\]/u);
});

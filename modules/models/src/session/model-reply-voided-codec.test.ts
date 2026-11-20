import { expect, test } from 'bun:test';
import { modelReplyVoidedCodec } from './model-reply-voided-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelReplyVoidedCodec.encode({
    replySequence: 41,
    runID: 'run-1',
    reason: 'attempt_failed',
  });

  expect(modelReplyVoidedCodec.decode(payload)).toStrictEqual({
    replySequence: 41,
    runID: 'run-1',
    reason: 'attempt_failed',
  });
});

test('it refuses a void with an unknown reason', () => {
  expect(() =>
    modelReplyVoidedCodec.decode({ replySequence: 41, runID: 'run-1', reason: 'unknown' }),
  ).toThrow(/"path": \[\s+"reason"\s+\]/u);
});

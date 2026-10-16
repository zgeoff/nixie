import { expect, test } from 'bun:test';
import { modelSessionCleanupCompletedCodec } from './model-session-cleanup-completed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelSessionCleanupCompletedCodec.encode({ itemID: 'item-1' });

  expect(modelSessionCleanupCompletedCodec.decode(payload)).toStrictEqual({ itemID: 'item-1' });
});

test('it refuses an item ID that is not a string', () => {
  expect(() => modelSessionCleanupCompletedCodec.decode({ itemID: 7 })).toThrow(
    /"path": \[\s+"itemID"\s+\]/u,
  );
});

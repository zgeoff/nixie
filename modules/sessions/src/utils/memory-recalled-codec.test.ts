import { expect, test } from 'bun:test';
import { memoryRecalledCodec } from './memory-recalled-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = memoryRecalledCodec.encode({
    items: [{ itemID: 'item-1', version: 2, score: 0.5, similarity: 0.8 }],
    searchMode: 'hybrid',
    isTurnNote: true,
  });

  expect(memoryRecalledCodec.decode(payload)).toStrictEqual({
    items: [{ itemID: 'item-1', version: 2, score: 0.5, similarity: 0.8 }],
    searchMode: 'hybrid',
    isTurnNote: true,
  });
});

test('it refuses an item at version 0', () => {
  expect(() => memoryRecalledCodec.decode({ items: [{ itemID: 'item-1', version: 0 }] })).toThrow(
    /"version"/u,
  );
});

test('it reads the items of a recall recorded before it kept its search mode', () => {
  expect(
    memoryRecalledCodec.tryDecodePartial({ items: [{ itemID: 'item-1', version: 1 }] }),
  ).toStrictEqual({ items: [{ itemID: 'item-1', version: 1 }] });
});

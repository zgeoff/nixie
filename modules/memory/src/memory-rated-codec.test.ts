import { expect, test } from 'bun:test';
import { memoryRatedCodec } from './memory-rated-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = memoryRatedCodec.encode({
    ratingID: 'rating-1',
    recalledSequence: 4,
    runID: 'run-1',
    ratedBy: 'writer',
    ratings: [{ itemID: 'item-1', version: 1, verdict: 'helpful', sealedNote: 'c2VhbGVk' }],
  });

  expect(memoryRatedCodec.decode(payload)).toStrictEqual({
    ratingID: 'rating-1',
    recalledSequence: 4,
    runID: 'run-1',
    ratedBy: 'writer',
    ratings: [{ itemID: 'item-1', version: 1, verdict: 'helpful', sealedNote: 'c2VhbGVk' }],
  });
});

test('it refuses a verdict outside the rating scale', () => {
  expect(() =>
    memoryRatedCodec.decode({
      ratingID: 'rating-1',
      recalledSequence: 4,
      runID: 'run-1',
      ratings: [{ itemID: 'item-1', version: 1, verdict: 'great' }],
    }),
  ).toThrow(/"verdict"/u);
});

test('it reads no partial payload from ratings in another shape', () => {
  expect(memoryRatedCodec.tryDecodePartial({ ratings: 'helpful' })).toBeNull();
});

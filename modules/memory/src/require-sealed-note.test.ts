import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { decodeRatingNote } from './decode-rating-note';
import { MemoryRatingError } from './memory-rating-error';
import { readItemKey } from './read-item-key';
import { requireSealedNote } from './require-sealed-note';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test("it seals the note under its item's key", async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  const sealed = await requireSealedNote(ctx.memory.log, {
    ratingID: 'rating-1',
    itemID: tram.itemID,
    shortID: 'm1',
    note: 'it was out of date',
  });

  const key = await readItemKey(ctx.memory.log, tram.itemID);

  invariant(key);

  const text = await decodeRatingNote(key, { ratingID: 'rating-1', itemID: tram.itemID }, sealed);

  expect(text).toBe('it was out of date');
});

test('it refuses a note on a forgotten item by its short ID', async () => {
  const ctx = await setupTest();
  const tram = await createMemoryItem(ctx.memory.store, { text: 'Takes the tram to work' });

  await ctx.memory.store.forget({ target: tram, provenance: buildMockProvenance() });

  expect(
    requireSealedNote(ctx.memory.log, {
      ratingID: 'rating-1',
      itemID: tram.itemID,
      shortID: 'm1',
      note: 'it was out of date',
    }),
  ).rejects.toThrowWithMessage(
    MemoryRatingError,
    "m1 was forgotten, so a note on it can't be kept.",
  );
});

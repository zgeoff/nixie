import { expect, test } from 'bun:test';
import { decodeRatingNote } from './decode-rating-note';
import { encodeChangeComment } from './encode-change-comment';
import { encodeRatingNote } from './encode-rating-note';

async function setupTest() {
  const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);

  return { key };
}

test('it opens the note it sealed for the same rating and item', async () => {
  const ctx = await setupTest();

  const sealed = await encodeRatingNote(
    ctx.key,
    { ratingID: 'rating-a', itemID: 'item-a' },
    'beside the point',
  );

  expect(
    decodeRatingNote(ctx.key, { ratingID: 'rating-a', itemID: 'item-a' }, sealed),
  ).resolves.toBe('beside the point');
});

test('it rejects a note sealed for another item', async () => {
  const ctx = await setupTest();

  const sealed = await encodeRatingNote(
    ctx.key,
    { ratingID: 'rating-a', itemID: 'item-a' },
    'beside the point',
  );

  expect(
    decodeRatingNote(ctx.key, { ratingID: 'rating-a', itemID: 'item-b' }, sealed),
  ).rejects.toThrow();
});

test('it rejects a note sealed for another rating', async () => {
  const ctx = await setupTest();

  const sealed = await encodeRatingNote(
    ctx.key,
    { ratingID: 'rating-a', itemID: 'item-a' },
    'beside the point',
  );

  expect(
    decodeRatingNote(ctx.key, { ratingID: 'rating-b', itemID: 'item-a' }, sealed),
  ).rejects.toThrow();
});

test('it rejects a change comment in place of a note', async () => {
  const ctx = await setupTest();
  const sealed = await encodeChangeComment(ctx.key, 'rating-a', 'Keep the joke.');

  expect(
    decodeRatingNote(ctx.key, { ratingID: 'rating-a', itemID: 'item-a' }, sealed),
  ).rejects.toThrow();
});

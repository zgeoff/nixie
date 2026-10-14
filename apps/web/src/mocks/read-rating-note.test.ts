import { expect, test } from 'bun:test';
import { readRatingNote } from './read-rating-note';
import { store } from './store';

test('it reads a readable note with its text', async () => {
  await store.ratingNotes.create({ itemID: 'item-a', sequence: 7, text: 'Stub note' });

  expect(readRatingNote({ itemID: 'item-a', sequence: 7 })).toStrictEqual({
    itemID: 'item-a',
    sequence: 7,
    status: 'readable',
    text: 'Stub note',
  });
});

test('it reads a shredded note with no text', async () => {
  await store.ratingNotes.create({
    itemID: 'item-a',
    sequence: 7,
    status: 'shredded',
    text: 'Stub note',
  });

  expect(readRatingNote({ itemID: 'item-a', sequence: 7 })).toStrictEqual({
    itemID: 'item-a',
    sequence: 7,
    status: 'shredded',
  });
});

test('it reads a note the store lacks as missing', async () => {
  await store.ratingNotes.create({ itemID: 'item-a', sequence: 7, text: 'Stub note' });

  expect(readRatingNote({ itemID: 'item-a', sequence: 8 })).toStrictEqual({
    itemID: 'item-a',
    sequence: 8,
    status: 'missing',
  });
});

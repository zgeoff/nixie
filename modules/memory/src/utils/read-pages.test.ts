import { expect, mock, test } from 'bun:test';
import invariant from 'tiny-invariant';
import type { ItemPage } from './read-pages';
import { readPages } from './read-pages';

test('it yields every item of every page in order, reading each page after the cursor the page before names', async () => {
  const pages = new Map<number, ItemPage<string>>([
    [0, { items: ['Owns a red kayak', 'Walks the dog at 7'], next: 41 }],
    [41, { items: ['Plays cello on Sundays'], next: 96 }],
    [96, { items: ['Grows tomatoes on the balcony'], next: null }],
  ]);

  const readPage = mock((after: number) => {
    const page = pages.get(after);

    invariant(page);

    return Promise.resolve(page);
  });

  const items = await Array.fromAsync(readPages(readPage));

  expect(items).toStrictEqual([
    'Owns a red kayak',
    'Walks the dog at 7',
    'Plays cello on Sundays',
    'Grows tomatoes on the balcony',
  ]);

  expect(readPage.mock.calls).toStrictEqual([[0], [41], [96]]);
});

test('it yields nothing when the first page is empty and the last', async () => {
  const items = await Array.fromAsync(readPages(() => Promise.resolve({ items: [], next: null })));

  expect(items).toStrictEqual([]);
});

// A `yield*` walk took 2.8 s to 5.5 s and one loop about 20 ms, and the budget leaves room for a
// slow runner.
test('it walks 100,000 items over 1,000 pages within a linear time budget', async () => {
  const pages = Array.from({ length: 1000 }, (_, page): ItemPage<number> => ({
    items: Array.from({ length: 100 }, (_item, index) => page * 100 + index),
    next: page < 999 ? page + 1 : null,
  }));

  const startedAt = performance.now();

  const items = await Array.fromAsync(
    readPages((after) => {
      const page = pages[after];

      invariant(page);

      return Promise.resolve(page);
    }),
  );

  const elapsed = performance.now() - startedAt;

  expect(items).toStrictEqual(Array.from({ length: 100_000 }, (_, index) => index));
  expect(elapsed).toBeLessThan(1000);
});

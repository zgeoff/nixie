import { expect, mock, test } from 'bun:test';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildStubEncoder } from '../test-utils/build-stub-encoder';
import { createMemoryItem } from '../test-utils/create-memory-item';
import { readItemShortID } from '../test-utils/read-item-short-id';
import { startTestMemory } from '../test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['boiler', 'heating'], ['piano'], ['passport']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  return {
    memory,
    remember: async (text: string) => {
      const item = await createMemoryItem(memory.store, { text });

      return { ...item, shortID: await readItemShortID(memory.log, item.itemID) };
    },
    read: async (text: string) => {
      await memory.store.waitForSemanticIndex();

      return memory.store.readRelated(text);
    },
  };
}

test('it returns the short ID and text of an active item that the text closely matches', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.remember('The boiler service is on the 14th');

  await ctx.remember('The piano is tuned in spring');

  const related = await ctx.read('Book the heating engineer');

  expect(related).toStrictEqual([
    { shortID: boiler.shortID, text: 'The boiler service is on the 14th' },
  ]);
});

test('it returns nothing when no item matches', async () => {
  const ctx = await setupTest();

  await ctx.remember('The boiler service is on the 14th');

  const related = await ctx.read('Renew the passport');

  expect(related).toStrictEqual([]);
});

test('it skips a retired item', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.remember('The boiler service is on the 14th');

  await ctx.memory.store.retire({ target: boiler, provenance: buildMockProvenance() });

  const related = await ctx.read('Book the heating engineer');

  expect(related).toStrictEqual([]);
});

test('it skips a forgotten item', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.remember('The boiler service is on the 14th');

  await ctx.memory.store.forget({ target: boiler, provenance: buildMockProvenance() });
  await ctx.memory.store.finishForgets([boiler.itemID]);

  const related = await ctx.read('Book the heating engineer');

  expect(related).toStrictEqual([]);
});

test('it returns at most 3 items', async () => {
  const ctx = await setupTest();

  await Promise.all(
    ['one', 'two', 'three', 'four'].map((word) =>
      ctx.remember(`The boiler note ${word} is about heating`),
    ),
  );

  const related = await ctx.read('Book the heating engineer');

  expect(related).toHaveLength(3);
});

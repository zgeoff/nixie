import { expect, test } from 'bun:test';
import { memoryConfigSchema } from '@heynixie/memory';
import { createMemoryItem, readItemShortID, startTestMemory } from '@heynixie/memory/test-utils';
import { localMemoryConfig } from './local-memory-config';

async function setupTest() {
  const memory = await startTestMemory({ turn: memoryConfigSchema.parse(localMemoryConfig).turn });

  return {
    remember: async (text: string) => {
      const item = await createMemoryItem(memory.store, { text });

      return { ...item, shortID: await readItemShortID(memory.log, item.itemID) };
    },
    readRelated: (text: string) => memory.store.readRelated(text),
  };
}

test('it lets a store with no encoder find its one item as related to a call that shares its words', async () => {
  const ctx = await setupTest();
  const bees = await ctx.remember('The user keeps bees on the allotment.');
  const related = await ctx.readRelated('Check the bees\nCheck on the bees on the allotment.');

  expect(related).toStrictEqual([
    { shortID: bees.shortID, text: 'The user keeps bees on the allotment.' },
  ]);
});

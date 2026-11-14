import { expect, test } from 'bun:test';
import { readForgetFloor } from './read-forget-floor';
import { createMemoryItem, startTestMemory } from './test-utils';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test('it finds the sequence of the first record of a memory item', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is allergic to peanuts' });
  const later = await createMemoryItem(ctx.memory.store, { text: 'Likes green tea' });
  const floor = await readForgetFloor(ctx.memory.log, { itemID: item.itemID });
  const laterFloor = await readForgetFloor(ctx.memory.log, { itemID: later.itemID });

  expect(floor).toBeGreaterThan(0);
  expect(laterFloor).toBeGreaterThan(floor ?? 0);
});

test('it finds no floor for an item that no record names', async () => {
  const ctx = await setupTest();
  const floor = await readForgetFloor(ctx.memory.log, { itemID: crypto.randomUUID() });

  expect(floor).toBeNull();
});

test('it finds no floor for a moment that holds no text', async () => {
  const ctx = await setupTest();
  const floor = await readForgetFloor(ctx.memory.log, { momentID: crypto.randomUUID() });

  expect(floor).toBeNull();
});

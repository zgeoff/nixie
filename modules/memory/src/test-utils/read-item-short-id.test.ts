import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildMemorySeeder } from './build-memory-seeder';
import { readItemShortID } from './read-item-short-id';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  return { memory, seed: buildMemorySeeder({ store: memory.store, log: memory.log, clock }) };
}

test('it reads the short ID the items table holds for an item', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.item();
  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  const [recalledItem] = recalled.items;

  invariant(recalledItem, 'the item recalls');

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);

  expect(shortID).toBe(recalledItem.shortID);
});

test('it fails for an item that holds no short ID', async () => {
  const ctx = await setupTest();
  const item = await ctx.seed.itemWithoutShortID();

  const read = readItemShortID(ctx.memory.log, item.itemID);

  await read.catch(() => {});

  expect(read).rejects.toThrowWithMessage(Error, `memory item ${item.itemID} holds no short ID`);
});

test('it fails for an item ID that names no item', async () => {
  const ctx = await setupTest();

  const read = readItemShortID(ctx.memory.log, '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01');

  await read.catch(() => {});

  expect(read).rejects.toThrow();
});

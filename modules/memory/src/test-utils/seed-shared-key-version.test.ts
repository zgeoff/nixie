import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { seedSharedKeyVersion } from './seed-shared-key-version';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it seeds a version that reads under the item key and has no version key record', async () => {
  const ctx = await setupTest();
  const item = await seedSharedKeyVersion(ctx.memory.log, { text: 'Keeps bees' });
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });
  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(item).toStrictEqual({ itemID: expect.toBeString(), version: 1 });
  expect(recalled.items).toMatchObject([{ text: 'Keeps bees', version: 1 }]);
  expect(records.map((entry) => entry.record.kind)).toStrictEqual(['memory.version_added']);
});

test('it seeds a later version of the same item', async () => {
  const ctx = await setupTest();
  const first = await seedSharedKeyVersion(ctx.memory.log, { text: 'Keeps bees' });

  const second = await seedSharedKeyVersion(ctx.memory.log, {
    target: first,
    text: 'Keeps two hives',
  });

  const history = await ctx.memory.store.readHistory(first.itemID);

  expect(second).toStrictEqual({ itemID: first.itemID, version: 2 });
  expect(history?.versions).toMatchObject([{ text: 'Keeps bees' }, { text: 'Keeps two hives' }]);
});

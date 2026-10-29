import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it marks an active item sensitive without adding a version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives at 14 Larkspur Lane, flat 3',
    provenance: buildMockProvenance(),
  });

  const ref = await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['version', 'is_sensitive'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(ref).toStrictEqual({ itemID: item.itemID, version: 1 });
  expect(row).toStrictEqual({ version: 1, is_sensitive: 1 });
});

test('it marks a retired item sensitive', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lived at 9 Mill Lane',
    provenance: buildMockProvenance(),
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const page = await ctx.memory.store.view.readPage({ state: 'retired' });

  expect(page.items).toMatchObject([
    { itemID: item.itemID, version: retired.version, isSensitive: true },
  ]);
});

test('it refuses to mark a forgotten item, and writes no mark', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives at 14 Larkspur Lane, flat 3',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  const marked = ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  await marked.catch(() => {});

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.sensitive_marked'],
  });

  expect(marked).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(records).toStrictEqual([]);
});

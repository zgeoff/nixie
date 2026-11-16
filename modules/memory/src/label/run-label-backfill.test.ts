import { expect, test } from 'bun:test';
import { startNextTestMemory, startTestMemory } from '../test-utils';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import type { TestMemory } from '../test-utils/start-test-memory';
import type { MemoryTables } from '../types';

async function setupTest() {
  const memory = await startTestMemory();

  return {
    memory,
    readLabelRows: (current: TestMemory) =>
      current.writer.db
        .$extendTables<MemoryTables>()
        .selectFrom('memory_labels')
        .select(['item_id', 'revision', 'version', 'change', 'origin'])
        .orderBy('sequence')
        .execute(),
  };
}

test('it labels each active and retired item with no label record once, across 2 starts', async () => {
  const ctx = await setupTest();

  const created = await ctx.memory.store.remember({
    text: 'The piano is tuned each March',
    provenance: buildMockProvenance(),
  });

  const edited = await ctx.memory.store.remember({
    target: created,
    text: 'The piano is tuned each April',
    provenance: buildMockProvenance(),
  });

  const retired = await ctx.memory.store.remember({
    text: 'The old tuner came on Tuesdays',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.retire({ target: retired, provenance: buildMockProvenance() });

  const first = await startNextTestMemory(ctx.memory);
  const second = await startNextTestMemory(first);
  const rows = await ctx.readLabelRows(second);

  expect(rows).toStrictEqual([
    { item_id: edited.itemID, revision: 2, version: 2, change: 'backfilled', origin: 'migration' },
    { item_id: retired.itemID, revision: 2, version: 2, change: 'backfilled', origin: 'migration' },
  ]);
});

test('it gives a backfilled item its text on one line, cut to 80 characters, as the gist and its subject as the topic', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano\nis tuned each March by the same tuner, who also restrings the old harp and the cello',
    provenance: buildMockProvenance(),
  });

  const next = await startNextTestMemory(ctx.memory);
  const recalled = await next.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([
    {
      gist: 'The piano is tuned each March by the same tuner, who also restrings the old harp',
      topic: 'owner',
      triggers: [],
    },
  ]);
});

test('it labels no forgotten item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });
  await ctx.memory.store.finishForgets([item.itemID]);

  const next = await startNextTestMemory(ctx.memory);
  const rows = await ctx.readLabelRows(next);

  expect(rows).toStrictEqual([]);
});

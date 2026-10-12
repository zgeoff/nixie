import { expect, test } from 'bun:test';
import type { MemoryTables } from '../types';
import { readMemoryRows } from './read-memory-rows';
import { startTestMemory } from './start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.withTables<MemoryTables>() };
}

test('it reads both memory projections in key order', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const rows = await readMemoryRows(ctx.db);

  expect(rows.items).toMatchObject([{ item_id: item.itemID, version: 2, state: 'retired' }]);
  expect(rows.versions.map((row) => row.version_key)).toStrictEqual([
    `${item.itemID}/1`,
    `${item.itemID}/2`,
  ]);
});

test('it reads empty projections as empty lists', async () => {
  const ctx = await setupTest();

  const rows = await readMemoryRows(ctx.db);

  expect(rows).toStrictEqual({ items: [], versions: [] });
});

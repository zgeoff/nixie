import { expect, mock, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import { createMemoryItem } from './test-utils/create-memory-item';
import { readMemoryRows } from './test-utils/read-memory-rows';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions, MemoryTables } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const memory = await startTestMemory({ cleanupSessions });

  return { memory, cleanupSessions, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it forgets every active and retired item, and leaves each reading as forgotten', async () => {
  const ctx = await setupTest();
  const active = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });
  const retired = await createMemoryItem(ctx.memory.store, { text: 'Rows on Sunday mornings' });

  await ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const histories = await Promise.all(
    [active, retired].map((item) => ctx.memory.store.readHistory(item.itemID)),
  );

  expect(forgotten).toStrictEqual([active.itemID, retired.itemID]);

  expect(histories).toMatchObject([
    { state: 'forgotten', versions: [{ status: 'shredded' }] },
    { state: 'forgotten', versions: [{ status: 'shredded' }, { status: 'shredded' }] },
  ]);

  expect(ctx.cleanupSessions.mock.calls).toStrictEqual([
    [{ itemID: active.itemID }],
    [{ itemID: retired.itemID }],
  ]);
});

test('it leaves out an item that an earlier forget took', async () => {
  const ctx = await setupTest();
  const earlier = await createMemoryItem(ctx.memory.store, { text: 'Hums while cooking' });
  const later = await createMemoryItem(ctx.memory.store, { text: 'Owns a green kayak' });

  await ctx.memory.store.forget({
    target: earlier,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(forgotten).toStrictEqual([later.itemID]);
});

test('it forgets nothing and runs no session cleanup when memory holds no item', async () => {
  const ctx = await setupTest();

  const forgotten = await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(forgotten).toStrictEqual([]);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});

test('it rebuilds the rows after a forget of every item equal to the live rows', async () => {
  const ctx = await setupTest();

  await createMemoryItem(ctx.memory.store, { text: 'Bakes rye bread on Fridays' });

  const retired = await createMemoryItem(ctx.memory.store, { text: 'Collects old maps' });

  await ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forgetAll({
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const live = await readMemoryRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMemoryRows(ctx.db);

  expect(live.items.map((row) => row.state)).toStrictEqual(['forgotten', 'forgotten']);
  expect(rebuilt).toStrictEqual(live);
});

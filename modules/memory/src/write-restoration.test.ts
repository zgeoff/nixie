import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it restores a retired item as active with the text it had', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    intentQuote: 'forget my address',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const restored = await ctx.memory.store.restore({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({ query: 'Elm' });

  expect(restored).toStrictEqual({ itemID: item.itemID, version: 3 });

  expect(recalled.items).toMatchObject([
    {
      itemID: item.itemID,
      version: 3,
      change: 'restored',
      state: 'active',
      text: 'Lives on Elm Street',
    },
  ]);
});

test('it keeps the source of the text it restores', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: {
      origin: 'task',
      source: 'untrusted',
      taskID: 'task-3',
      proposalID: null,
      checks: null,
    },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.restore({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([{ version: 3, origin: 'owner', source: 'untrusted' }]);
});

test('it rejects a restore of an active item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const restore = ctx.memory.store.restore({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await restore.catch(() => {});

  expect(restore).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test("it commits the caller's own write in the restore's transaction", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.restore({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  const kinds = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('sequence', '>', 2)
    .orderBy('sequence')
    .execute();

  expect(kinds).toStrictEqual([{ kind: 'owner_message' }, { kind: 'memory.version_added' }]);
});

test('it clears the end time of a lapsed item it restores, so the next sweep leaves it active', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await memory.store.lapse();

  await memory.store.restore({
    target: { itemID: item.itemID, version: 2 },
    provenance: buildMockProvenance(),
  });

  const lapsed = await memory.store.lapse();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  const row = await memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('until')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(lapsed).toBe(0);

  expect(recalled.items).toMatchObject([
    { version: 3, change: 'restored', state: 'active', text: 'Is in Lisbon this week' },
  ]);

  expect(row.until).toBeNull();
});

test('it restores an item past its end time before any sweep retires it', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await memory.store.restore({ target: item, provenance: buildMockProvenance() });

  const lapsed = await memory.store.lapse();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(lapsed).toBe(0);
  expect(recalled.items).toMatchObject([{ version: 2, change: 'restored', state: 'active' }]);
});

test('it rejects a restore of an active item whose end time is still to come', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  expect(
    memory.store.restore({ target: item, provenance: buildMockProvenance() }),
  ).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test('it restores a pinned item past its end time unpinned, as after the sweep', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await memory.store.restore({ target: item, provenance: buildMockProvenance() });

  const core = await memory.store.readPinnedCore();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(core).toStrictEqual([]);
  expect(recalled.items).toMatchObject([{ version: 2, state: 'active', isPinned: false }]);
});

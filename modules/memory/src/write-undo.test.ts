import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it undoes an edit by adding a version with the text before it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const undone = await ctx.memory.store.undo({
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(undone).toStrictEqual({ itemID: item.itemID, version: 3 });

  expect(recalled.items).toMatchObject([
    { version: 3, change: 'undone', state: 'active', text: 'Lives on Elm Street' },
  ]);
});

test('it rejects an undo that brings back text too long for the 2,000-token pinned core', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const item = await ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shortened = await ctx.memory.store.remember({
    text: 'Keeps a reading list',
    target: item,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const undo = ctx.memory.store.undo({
    target: shortened,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await undo.catch(() => {});

  expect(undo).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});

test('it takes the source of the text it brings back', async () => {
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

  const edited = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.undo({
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toMatchObject([
    { version: 3, text: 'Lives on Elm Street', source: 'untrusted' },
  ]);
});

test('it rejects an undo of an edit after a later edit', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Pine Road',
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const undo = ctx.memory.store.undo({
    target: edited,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await undo.catch(() => {});

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(undo).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(recalled.items).toMatchObject([{ version: 3, text: 'Lives on Pine Road' }]);
});

test("it rolls back the caller's own write when the undo is stale", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const undo = ctx.memory.store.undo({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  await undo.catch(() => {});

  const written = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(undo).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(written).toStrictEqual([]);
});

test("it commits the caller's own write with the undo", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.undo({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  const written = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(written).toStrictEqual([{ kind: 'owner_message' }]);
});

test('it undoes a retirement by making the item active again', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  await ctx.memory.store.undo({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({ query: 'Elm' });

  expect(recalled.items).toMatchObject([
    { itemID: item.itemID, version: 3, change: 'undone', state: 'active' },
  ]);
});

test('it undoes the creation of an item by retiring it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  await ctx.memory.store.undo({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const recalled = await ctx.memory.store.recall({
    itemIDs: [item.itemID],
    includeRetired: true,
  });

  expect(recalled.items).toMatchObject([
    { version: 2, change: 'undone', state: 'retired', text: 'Lives on Elm Street' },
  ]);
});

test('it clears the end time when it undoes a lapse, so the next sweep leaves the item active', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  await memory.store.lapse();

  await memory.store.undo({
    target: { itemID: item.itemID, version: 2 },
    provenance: buildMockProvenance(),
  });

  const lapsed = await memory.store.lapse();
  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(lapsed).toBe(0);
  expect(recalled.items).toMatchObject([{ version: 3, change: 'undone', state: 'active' }]);
});

test('it keeps the end time of the version it returns to when it undoes an edit', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  const edited = await memory.store.remember({
    target: item,
    text: 'Is in Lisbon for good',
    until: null,
    provenance: buildMockProvenance(),
  });

  await memory.store.undo({ target: edited, provenance: buildMockProvenance() });

  clock.advance(Date.parse('2026-10-19T22:59:59Z') - clock.now());

  const recalled = await memory.store.recall({ itemIDs: [item.itemID] });

  expect(recalled.items).toStrictEqual([]);
});

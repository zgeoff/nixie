import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it retires an item, takes it out of search and keeps its text', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    intentQuote: 'I moved out of Elm Street',
    intentEvidence: { recordSequence: 5, start: 0, end: 25 },
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const searched = await ctx.memory.store.recall({ query: 'Elm' });
  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(searched.items).toStrictEqual([]);

  expect(history).toMatchObject({
    state: 'retired',
    versions: [
      { version: 1, change: 'created', status: 'readable', text: 'Lives on Elm Street' },
      { version: 2, change: 'retired', status: 'readable', text: 'Lives on Elm Street' },
    ],
  });
});

test('it keeps the source of the text it retires', async () => {
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

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history?.versions).toMatchObject([
    { version: 1, origin: 'task', source: 'untrusted' },
    { version: 2, origin: 'owner', source: 'untrusted' },
  ]);
});

test('it takes a retired item out of the pinned core', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['is_pinned', 'pinned_sequence'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ is_pinned: 0, pinned_sequence: null });
});

test('it rejects a retirement of a retired item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retire = ctx.memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await retire.catch(() => {});

  expect(retire).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test("it commits the caller's own write in the retirement's transaction", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
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
    .where('sequence', '>', 1)
    .orderBy('sequence')
    .execute();

  expect(kinds).toStrictEqual([{ kind: 'owner_message' }, { kind: 'memory.version_added' }]);
});

test("it rolls back the caller's own write when the retirement is stale", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a spare key with the neighbour',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Keeps a spare key in the shed',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retire = ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  await retire.catch(() => {});

  const checked = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(retire).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(checked).toStrictEqual([]);
});

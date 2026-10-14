import { expect, test } from 'bun:test';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { isCuid } from '@paralleldrive/cuid2';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test('it creates an item at version 1 with its provenance', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Prefers window seats on trains',
    evidenceQuote: 'I always take the window seat',
    evidence: { recordSequence: 3, start: 0, end: 29 },
    provenance: {
      origin: 'task',
      source: 'owner',
      taskID: 'task-7',
      proposalID: 'proposal-2',
      checks: { quote: 'pass' },
    },
  });

  const rows = await ctx.db.selectFrom('memory_versions').selectAll().execute();

  expect(rows).toStrictEqual([
    {
      version_key: `${item.itemID}/1`,
      item_id: item.itemID,
      version: 1,
      change: 'created',
      state: 'active',
      sealed: expect.toBeString(),
      evidence: '{"recordSequence":3,"start":0,"end":29}',
      intent_evidence: null,
      origin: 'task',
      source: 'owner',
      task_id: 'task-7',
      proposal_id: 'proposal-2',
      checks: '{"quote":"pass"}',
      model: null,
      sequence: 1,
      snapshot_hash: 'sha256:test',
      recorded_at: expect.toBeNumber(),
    },
  ]);
});

test('it gives a new item a 10-character cuid2 short ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Prefers window seats on trains',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('short_id')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row.short_id).toHaveLength(10);
  expect(isCuid(row.short_id ?? '', { minLength: 10, maxLength: 10 })).toBeTrue();
});

test('it keeps the short ID of an item through its later versions', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const created = await ctx.db
    .selectFrom('memory_items')
    .select('short_id')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.db
    .selectFrom('memory_items')
    .select('short_id')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(edited.short_id).toBe(created.short_id);
});

test('it adds an edited version that keeps the state of the item', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.memory.store.remember({
    text: 'Lived on Elm Street until 2024',
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const recalled = await ctx.memory.store.recall({
    itemIDs: [item.itemID],
    includeRetired: true,
  });

  expect(edited).toStrictEqual({ itemID: item.itemID, version: 3 });
  expect(recalled.items).toMatchObject([
    { version: 3, change: 'edited', state: 'retired', text: 'Lived on Elm Street until 2024' },
  ]);
});

test('it rejects an edit that grows a pinned item past the 2,000-token pinned core, and keeps the old text', async () => {
  const ctx = await setupTest();

  // about 1,100 tokens, at 4 characters a token
  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const edit = ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await edit.catch(() => {});

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(edit).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
  expect(recalled.items).toMatchObject([{ version: 1, text: 'Goes by Sam' }]);
});

test('it rejects an edit made from a stale revision', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'task',
      source: 'owner',
      taskID: 'task-1',
      proposalID: null,
      checks: null,
    },
  });

  const stale = ctx.memory.store.remember({
    text: 'Lives on Pine Road',
    target: item,
    provenance: {
      origin: 'task',
      source: 'owner',
      taskID: 'task-2',
      proposalID: null,
      checks: null,
    },
  });

  await stale.catch(() => {});

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(stale).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(recalled.items).toMatchObject([{ version: 2, text: 'Lives on Oak Avenue' }]);
});

test('it pins a new item when asked', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row.is_pinned).toBe(1);
});

test('it rejects an edit that pins a retired item', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edit = ctx.memory.store.remember({
    text: 'Lived on Elm Street until 2024',
    target: retired,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await edit.catch(() => {});

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(edit).rejects.toMatchObject({ code: 'WRONG_STATE' });
  expect(recalled.items).toMatchObject([{ version: 2, isPinned: false }]);
});

test('it keeps no item text in plain form in nixie.db or any file beside it', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Zebra-crossing keyword marmalade',
    evidenceQuote: 'quoted evidence periwinkle',
    evidence: { recordSequence: 1, start: 0, end: 26 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const edited = await ctx.memory.store.remember({
    text: 'Second version tangerine',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: edited,
    intentQuote: 'retirement request saffron',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await ctx.memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  const names = await readdir(ctx.memory.dataDir);
  const files = await Promise.all(
    names
      .filter((name) => name.startsWith('nixie.db') || name.startsWith('keys.db'))
      .map((name) => readFile(join(ctx.memory.dataDir, name), 'latin1')),
  );
  const contents = files.join('\n');

  expect(names).toIncludeAllMembers(['nixie.db', 'nixie.db-wal', 'keys.db']);
  expect(contents).not.toMatch(/marmalade|periwinkle|tangerine|saffron/u);
});

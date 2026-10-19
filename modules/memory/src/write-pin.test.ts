import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MemoryTables>() };
}

test.each(['owner', 'shared', 'self'] as const)(
  'it pins an item whose subject is %s',
  async (subject) => {
    const ctx = await setupTest();

    const item = await ctx.memory.store.remember({
      text: 'Tidy lists are part of the plan',
      subject,
      provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
    });

    await ctx.memory.store.pin({
      itemID: item.itemID,
      isPinned: true,
      version: item.version,
      provenance: buildMockProvenance({ origin: 'conversation' }),
    });

    const core = await ctx.memory.store.readPinnedCore();

    expect(core).toMatchObject([{ itemID: item.itemID, subject }]);
  },
);

test('it unpins a self-note', async () => {
  const ctx = await setupTest();

  const note = await ctx.memory.store.remember({
    text: 'I like tidy lists',
    subject: 'self',
    provenance: buildMockProvenance({ origin: 'conversation', source: 'untrusted' }),
  });

  const unpin = ctx.memory.store.pin({
    itemID: note.itemID,
    isPinned: false,
    provenance: buildMockProvenance(),
  });

  expect(unpin).resolves.toBeUndefined();
});

test('it pins an active item without adding a version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['version', 'is_pinned', 'pinned_sequence'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ version: 1, is_pinned: 1, pinned_sequence: 2 });
});

test('it unpins an item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Goes by Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select(['is_pinned', 'pinned_sequence'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ is_pinned: 0, pinned_sequence: null });
});

test('it rejects a pin of a retired item', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'WRONG_STATE' });
});

test('it rejects a pin that takes the pinned core past 2,000 tokens, and pins nothing', async () => {
  const ctx = await setupTest();

  // about 1,100 tokens each, at 4 characters a token
  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: second.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', second.itemID)
    .executeTakeFirstOrThrow();

  expect(pin).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
  expect(row.is_pinned).toBe(0);
});

test("it runs the caller's own write before it checks the pinned core's room", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(240),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: () => Promise.reject(new Error('the action already ran')),
  });

  await pin.catch(() => {});

  expect(pin).rejects.toThrow('the action already ran');
});

test('it rejects a new pinned item that takes the pinned core past 2,000 tokens', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const remember = ctx.memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(116),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await remember.catch(() => {});

  expect(remember).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});

test('it counts the owner name each pinned line shows against the pinned core budget', async () => {
  const memory = await startTestMemory({ gate: { ownerName: 'Bartholomew '.repeat(100).trim() } });

  // about 1,800 tokens of text, which fits beside a short name and not beside this one
  const remember = memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(190),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await remember.catch(() => {});

  expect(remember).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});

test('it pins an item that fits the pinned core budget beside a short owner name', async () => {
  const memory = await startTestMemory({ gate: { ownerName: 'Robin' } });

  const ref = await memory.store.remember({
    text: 'Keeps a long reading list for winter. '.repeat(190),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  expect(ref.version).toBe(1);
});

test('it rejects a pin whose quotes take the pinned core past 2,000 tokens', async () => {
  const ctx = await setupTest();

  // short texts, with quotes of about 1,100 tokens each at 4 characters a token
  await ctx.memory.store.remember({
    text: 'Likes the window seat',
    evidenceQuote: 'I always take the window seat on the train to the coast. '.repeat(77),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.store.remember({
    text: 'Drinks oat milk',
    evidenceQuote: 'Oat milk in the coffee, please, never the dairy kind. '.repeat(81),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: second.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', second.itemID)
    .executeTakeFirstOrThrow();

  expect(pin).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
  expect(row.is_pinned).toBe(0);
});

test('it rejects a new pinned item whose quote takes the pinned core past 2,000 tokens', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Likes the window seat',
    evidenceQuote: 'I always take the window seat on the train to the coast. '.repeat(77),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const remember = ctx.memory.store.remember({
    text: 'Drinks oat milk',
    evidenceQuote: 'Oat milk in the coffee, please, never the dairy kind. '.repeat(81),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await remember.catch(() => {});

  expect(remember).rejects.toMatchObject({ code: 'PINNED_CORE_FULL' });
});

test('it pins an item that fits the pinned core beside the items already pinned', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Keeps a long packing list for trips. '.repeat(119),
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const short = await ctx.memory.store.remember({
    text: 'Uses they/them',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: short.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', short.itemID)
    .executeTakeFirstOrThrow();

  expect(row.is_pinned).toBe(1);
});

test('it rejects a pin bound to a version the item moved past, and pins nothing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Takes the 7:40 train',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Takes the 8:10 train',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const pin = ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    version: 1,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(pin).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(row.is_pinned).toBe(0);
});

test('it pins an item bound to the version it is at', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Takes the 7:40 train',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
    version: 1,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('is_pinned')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row.is_pinned).toBe(1);
});

test("it commits the caller's own write in the pin's transaction", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Takes the 7:40 train',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.pin({
    itemID: item.itemID,
    isPinned: true,
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
    .where('kind', 'in', ['owner_message', 'memory.pinned'])
    .orderBy('sequence')
    .execute();

  expect(kinds).toStrictEqual([{ kind: 'owner_message' }, { kind: 'memory.pinned' }]);
});

test("it rolls back the caller's own write when the pin fails", async () => {
  const ctx = await setupTest();

  const pin = ctx.memory.store.pin({
    itemID: 'no-such-item',
    isPinned: false,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  await pin.catch(() => {});

  const checked = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(pin).rejects.toMatchObject({ code: 'NOT_FOUND' });
  expect(checked).toStrictEqual([]);
});

test('it rejects a pin of an item that does not exist', async () => {
  const ctx = await setupTest();

  const pin = ctx.memory.store.pin({
    itemID: 'no-such-item',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await pin.catch(() => {});

  expect(pin).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

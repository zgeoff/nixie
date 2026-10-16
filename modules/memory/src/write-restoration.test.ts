import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { startTestMemory } from './test-utils/start-test-memory';

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
        { kind: 'test.checked', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
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

  expect(kinds).toStrictEqual([{ kind: 'test.checked' }, { kind: 'memory.version_added' }]);
});

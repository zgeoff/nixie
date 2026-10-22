import { expect, test } from 'bun:test';
import type { LogTables } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test("it keeps an item at the version you saw, committing only the caller's own write", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.keep({
    target: item,
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
    .where('kind', 'in', ['owner_message', 'memory.version_added'])
    .orderBy('sequence')
    .execute();

  expect(kinds).toStrictEqual([{ kind: 'memory.version_added' }, { kind: 'owner_message' }]);
});

test("it refuses a keep of a version the item moved past, and rolls back the caller's write", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Grows peppers on the balcony',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const keep = ctx.memory.store.keep({
    target: item,
    writeInTransaction: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        { kind: 'owner_message', definitions: { snapshotHash: 'sha256:test' }, payload: {} },
      ]);
    },
  });

  await keep.catch(() => {});

  const written = await ctx.memory.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('kind')
    .where('kind', '=', 'owner_message')
    .execute();

  expect(keep).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(written).toStrictEqual([]);
});

test('it refuses a keep of an item that does not exist', async () => {
  const ctx = await setupTest();

  const keep = ctx.memory.store.keep({
    target: { itemID: 'no-such-item', version: 1 },
    writeInTransaction: () => Promise.resolve(),
  });

  await keep.catch(() => {});

  expect(keep).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it keeps a retired item retired', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Grows tomatoes on the balcony',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const retired = await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.keep({ target: retired, writeInTransaction: () => Promise.resolve() });

  const history = await ctx.memory.store.readHistory(item.itemID);

  expect(history?.state).toBe('retired');
  expect(history?.versions).toHaveLength(2);
});

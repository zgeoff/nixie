import { expect, mock, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  return { memory: await startTestMemory({ cleanupSessions }), cleanupSessions };
}

test('it forgets every retired item it was given, with a forgotten record and no key for each', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const retired = await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  await ctx.memory.store.forgetRetired({
    targets: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const keys = await ctx.memory.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .where('key_id', 'in', [first.itemID, second.itemID])
    .execute();

  expect(
    records
      .filter((entry) => entry.record.kind === 'memory.forgotten')
      .map((entry) => entry.record.payload),
  ).toStrictEqual([{ itemID: first.itemID }, { itemID: second.itemID }]);

  expect(keys).toStrictEqual([]);
  expect(ctx.cleanupSessions).toHaveBeenCalledTimes(2);
});

test('it refuses the whole set when an item was restored after the preview, and deletes nothing', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const preview = await ctx.memory.store.view.readRetiredForgetPreview();

  await ctx.memory.store.restore({
    target: { itemID: second.itemID, version: 2 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const before = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const forget = ctx.memory.store.forgetRetired({
    targets: preview.items.map((item) => ({ itemID: item.itemID, version: item.version })),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await forget.catch(() => {});

  const after = await readRecords(ctx.memory.log, { afterSequence: 0 });
  const recalled = await ctx.memory.store.recall({ itemIDs: [first.itemID], includeRetired: true });

  expect(forget).rejects.toMatchObject({ code: 'STALE_VERSION' });
  expect(after).toStrictEqual(before);
  expect(recalled.items).toMatchObject([{ itemID: first.itemID, text: 'Owns a red canoe' }]);
  expect(ctx.cleanupSessions).not.toHaveBeenCalled();
});

test('it leaves alone an item retired after the preview', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  await ctx.memory.store.retire({
    target: first,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await ctx.memory.store.view.readRetiredForgetPreview();

  await ctx.memory.store.retire({
    target: second,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forgetRetired({
    targets: preview.items.map((item) => ({ itemID: item.itemID, version: item.version })),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const left = await ctx.memory.store.view.readPage({ state: 'retired' });

  expect(left.items).toMatchObject([
    { itemID: second.itemID, state: 'retired', text: 'Plays the oboe badly' },
  ]);
});

test('it refuses an active item, and deletes nothing', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });

  const forget = ctx.memory.store.forgetRetired({
    targets: [item],
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await forget.catch(() => {});

  const recalled = await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  expect(forget).rejects.toMatchObject({ code: 'WRONG_STATE' });
  expect(recalled.items).toMatchObject([{ itemID: item.itemID, text: 'Owns a red canoe' }]);
});

test('it refuses a restore of a reserved item while the deletion runs', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const retired = await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const hold = startFaultPointHold('memory.forget.key_removed');

  const forget = ctx.memory.store.forgetRetired({
    targets: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await hold.reached;

  const restore = ctx.memory.store.restore({
    target: { itemID: second.itemID, version: 2 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await restore.catch(() => {});

  hold.release();

  await forget;

  expect(restore).rejects.toMatchObject({ code: 'NOT_FOUND' });
});

test('it resumes a run that a crash stopped between two key deletions, and forgets each item once', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const retired = await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  startFaultPointFailure('memory.forget.key_removed');

  const crash = await ctx.memory.store
    .forgetRetired({
      targets: retired,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  const keysAtCrash = await ctx.memory.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .where('key_id', 'in', [first.itemID, second.itemID])
    .execute();

  const statusAtCrash = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);
  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const records = await readRecords(restarted.log, { afterSequence: 0 });
  const status = await restarted.store.view.readForgetStatus([first.itemID, second.itemID]);

  const keys = await restarted.writer.keys
    .$extendTables<{ record_keys: { key_id: string } }>()
    .selectFrom('record_keys')
    .select('key_id')
    .where('key_id', 'in', [first.itemID, second.itemID])
    .execute();

  expect(crash).toMatchObject({ message: 'crashed at memory.forget.key_removed' });
  expect(keysAtCrash).toStrictEqual([{ key_id: second.itemID }]);
  expect(statusAtCrash).toStrictEqual({ deleted: [], pending: [first.itemID, second.itemID] });

  expect(
    records
      .filter((entry) => entry.record.kind === 'memory.forgotten')
      .map((entry) => entry.record.payload),
  ).toStrictEqual([{ itemID: first.itemID }, { itemID: second.itemID }]);

  expect(status).toStrictEqual({ deleted: [first.itemID, second.itemID], pending: [] });
  expect(keys).toStrictEqual([]);
});

test('it reports an item whose forget is still pending apart from a deleted one', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const retired = await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  startFaultPointFailure('memory.forget.key_removed', second.itemID);

  await ctx.memory.store
    .forgetRetired({
      targets: retired,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    })
    .catch(() => {});

  const status = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);

  expect(status).toStrictEqual({ deleted: [first.itemID], pending: [second.itemID] });
});

test('it finishes the pending forgets of a run and reports every item deleted', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const retired = await Promise.all(
    [first, second].map((target) =>
      ctx.memory.store.retire({
        target,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  startFaultPointFailure('memory.forget.key_removed', second.itemID);

  const failure = await ctx.memory.store
    .forgetRetired({
      targets: retired,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    })
    .then(
      () => null,
      (error: unknown) => error,
    );

  const before = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);
  const status = await ctx.memory.store.finishForgets([first.itemID, second.itemID]);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(failure).toMatchObject({ message: 'crashed at memory.forget.key_removed' });
  expect(before).toStrictEqual({ deleted: [first.itemID], pending: [second.itemID] });
  expect(status).toStrictEqual({ deleted: [first.itemID, second.itemID], pending: [] });

  expect(
    records
      .filter((entry) => entry.record.kind === 'memory.forgotten')
      .map((entry) => entry.record.payload),
  ).toStrictEqual([{ itemID: first.itemID }, { itemID: second.itemID }]);
});

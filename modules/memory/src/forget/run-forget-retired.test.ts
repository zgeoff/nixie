import { expect, mock, test } from 'bun:test';
import { readRecordKeys, readRecords } from '@heynixie/log';
import type { ErasureSessionCause } from '@heynixie/log';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import { createMemoryItem } from '../test-utils/create-memory-item';
import { startFaultPointHold } from '../test-utils/start-fault-point-hold';
import { startNextTestMemory } from '../test-utils/start-next-test-memory';
import { startTestMemory } from '../test-utils/start-test-memory';

async function setupTest() {
  const cleanupSessions = mock<(cause: ErasureSessionCause) => Promise<void>>(() =>
    Promise.resolve(),
  );

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
  const keys = await readRecordKeys(ctx.memory.log, [first.itemID, second.itemID]);

  expect(records.filter((entry) => entry.record.kind === 'erasure.finished')).toMatchObject([
    { record: { payload: { targetID: first.itemID } } },
    { record: { payload: { targetID: second.itemID } } },
  ]);

  expect([...keys.keys()]).toStrictEqual([]);
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

  const hold = startFaultPointHold('erasure.keys_removed');

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

  startFaultPointFailure('erasure.keys_removed');

  const settled = await Promise.allSettled([
    ctx.memory.store.forgetRetired({
      targets: retired,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  ]);

  expect(settled).toMatchObject([
    { status: 'rejected', reason: { message: 'crashed at erasure.keys_removed' } },
  ]);

  const keysAtCrash = await readRecordKeys(ctx.memory.log, [first.itemID, second.itemID]);
  const statusAtCrash = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);
  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const records = await readRecords(restarted.log, { afterSequence: 0 });
  const status = await restarted.store.view.readForgetStatus([first.itemID, second.itemID]);
  const keys = await readRecordKeys(restarted.log, [first.itemID, second.itemID]);

  expect([...keysAtCrash.keys()]).toStrictEqual([second.itemID]);

  expect(statusAtCrash).toStrictEqual({
    deleted: [],
    pending: [first.itemID, second.itemID],
    forgottenSequence: null,
  });

  expect(records.filter((entry) => entry.record.kind === 'erasure.finished')).toMatchObject([
    { record: { payload: { targetID: first.itemID } } },
    { record: { payload: { targetID: second.itemID } } },
  ]);

  expect(status).toStrictEqual({
    deleted: [first.itemID, second.itemID],
    pending: [],
    forgottenSequence: records.at(-1)?.record.sequence ?? null,
  });

  expect([...keys.keys()]).toStrictEqual([]);
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

  startFaultPointFailure('erasure.keys_removed', undefined, 2);

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
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const forgotten = records.find((entry) => entry.record.kind === 'erasure.finished');

  expect(status).toStrictEqual({
    deleted: [first.itemID],
    pending: [second.itemID],
    forgottenSequence: forgotten?.record.sequence ?? null,
  });
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

  startFaultPointFailure('erasure.keys_removed', undefined, 2);

  const settled = await Promise.allSettled([
    ctx.memory.store.forgetRetired({
      targets: retired,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  ]);

  expect(settled).toMatchObject([
    { status: 'rejected', reason: { message: 'crashed at erasure.keys_removed' } },
  ]);

  const before = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);
  const status = await ctx.memory.store.finishForgets([first.itemID, second.itemID]);
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  const forgotten = records.filter((entry) => entry.record.kind === 'erasure.finished');

  expect(before).toStrictEqual({
    deleted: [first.itemID],
    pending: [second.itemID],
    forgottenSequence: forgotten[0]?.record.sequence ?? null,
  });

  expect(status).toStrictEqual({
    deleted: [first.itemID, second.itemID],
    pending: [],
    forgottenSequence: forgotten[1]?.record.sequence ?? null,
  });

  expect(records.filter((entry) => entry.record.kind === 'erasure.finished')).toMatchObject([
    { record: { payload: { targetID: first.itemID } } },
    { record: { payload: { targetID: second.itemID } } },
  ]);
});

test('it begins the targets that a stop between two starts left unbegun on the retry, and commits the caller hook with the last start only', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const retired = await Promise.all(
    [first, second].map((target) => ctx.memory.store.retire({ target, provenance })),
  );

  const writeInTransaction = mock(() => Promise.resolve());

  startFaultPointFailure('erasure.begun');

  const stopped = ctx.memory.store.forgetRetired({
    targets: retired,
    provenance,
    writeInTransaction,
  });

  await stopped.catch(() => {});

  const hookCallsAtStop = writeInTransaction.mock.calls.length;

  await ctx.memory.store.forgetRetired({ targets: retired, provenance, writeInTransaction });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  expect(stopped).rejects.toMatchObject({ message: 'crashed at erasure.begun' });
  expect(hookCallsAtStop).toBe(0);
  expect(writeInTransaction).toHaveBeenCalledTimes(1);

  expect(
    records.map((entry) => [entry.record.kind, entry.record.payload['targetID']]),
  ).toStrictEqual([
    ['erasure.started', first.itemID],
    ['erasure.started', second.itemID],
    ['erasure.finished', first.itemID],
    ['erasure.finished', second.itemID],
  ]);
});

test('it begins the unbegun targets on the retry when a restart finished the first item between the stop and the retry', async () => {
  const ctx = await setupTest();
  const first = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });
  const second = await createMemoryItem(ctx.memory.store, { text: 'Plays the oboe badly' });

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const retired = await Promise.all(
    [first, second].map((target) => ctx.memory.store.retire({ target, provenance })),
  );

  startFaultPointFailure('erasure.begun');

  const stopped = ctx.memory.store.forgetRetired({ targets: retired, provenance });

  await stopped.catch(() => {});
  await ctx.memory.store.finishForgets([first.itemID]);
  await ctx.memory.store.forgetRetired({ targets: retired, provenance });

  const status = await ctx.memory.store.view.readForgetStatus([first.itemID, second.itemID]);

  expect(stopped).rejects.toMatchObject({ message: 'crashed at erasure.begun' });
  expect(status).toMatchObject({ deleted: [first.itemID, second.itemID], pending: [] });
});

test('it starts no item when the caller check refuses', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Owns a red canoe' });

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  const retired = await ctx.memory.store.retire({ target: item, provenance });

  const forget = ctx.memory.store.forgetRetired({
    targets: [retired],
    provenance,
    checkInTransaction: () => Promise.reject(new Error('the action was used')),
  });

  await forget.catch(() => {});

  const status = await ctx.memory.store.view.readForgetStatus([item.itemID]);

  expect(forget).rejects.toMatchObject({ message: 'the action was used' });
  expect(status).toStrictEqual({ deleted: [], pending: [], forgottenSequence: null });
});

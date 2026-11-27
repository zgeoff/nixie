import { expect, mock, test } from 'bun:test';
import type { ErasureSessionCause } from '@heynixie/log';
import { readRecords, runProjectionRebuild, writeRecords } from '@heynixie/log';
import { startFaultPointFailure } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildMockCheckerAnswer, buildMockWriteCaller } from '../../test-utils';
import { buildMockProvenance } from '../../test-utils/build-mock-provenance';
import { createMemoryItem } from '../../test-utils/create-memory-item';
import { startFaultPointHold } from '../../test-utils/start-fault-point-hold';
import { startNextTestMemory } from '../../test-utils/start-next-test-memory';
import { startTestMemory } from '../../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../../test-utils/write-owner-message-record';
import type { MemoryTables } from '../../types';

async function setupTest() {
  const cleanupSessions = mock<(cause: ErasureSessionCause) => Promise<void>>(() =>
    Promise.resolve(),
  );

  const memory = await startTestMemory({
    cleanupSessions,
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ model: 'claude-sonnet-5-5' })) },
  });

  const db = memory.writer.db.$extendTables<MemoryTables>();

  return {
    memory,
    cleanupSessions,
    db,
    readForgetRows: async () => {
      const item = await db
        .selectFrom('memory_items')
        .select(['state', 'forgotten_sequence'])
        .executeTakeFirstOrThrow();

      const evidence = await db
        .selectFrom('memory_forgotten_evidence')
        .select(['record_sequence', 'item_id'])
        .orderBy('record_sequence')
        .execute();

      return { item, evidence };
    },
  };
}

test('it records the start with the key family, the session cause and the turn-input scope, then the finish with the key count', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  expect(records.map((entry) => entry.record.payload)).toMatchObject([
    {
      kind: 'memory_item',
      targetID: item.itemID,
      version: 1,
      parentID: null,
      by: 'user',
      capture: {
        keys: { family: item.itemID },
        cleanupKeys: [],
        sandboxCallIDs: [],
        purges: [],
        sessionCause: { itemID: item.itemID },
        turnInputs: { threads: ['conversation'], cleaned: true, floor: expect.any(Number) },
      },
    },
    { kind: 'memory_item', targetID: item.itemID, by: 'user', removedKeys: 2 },
  ]);
});

test('it records a forget that no owner asked for as the assistant’s', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await ctx.memory.store.forget({
    target: item,
    provenance: { ...buildMockProvenance(), origin: 'conversation' },
  });

  const [started] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['erasure.started'],
  });

  expect(started?.record.payload).toMatchObject({ by: 'assistant' });
});

test('it takes the item out of recall before any key goes', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'The spare key sits in the shed' });

  const hold = startFaultPointHold('erasure.sandboxes_destroyed');
  const forget = ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  await hold.reached;

  const recalled = await ctx.memory.store.recall({ query: 'spare key' });

  const row = await ctx.db
    .selectFrom('memory_items')
    .select('state')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  hold.release();

  await forget;

  expect(recalled.items).toStrictEqual([]);
  expect(row.state).toBe('forgetting');
});

test('it gives every state a forget sets the same rows after a rebuild, the forgotten-evidence block included', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Remember that I take my coffee black',
    spans: [{ start: 0, end: 36, source: 'typed' }],
  });

  const outcome = await ctx.memory.store.writes.remember({
    text: 'Takes coffee black',
    quote: 'I take my coffee black',
    caller: buildMockWriteCaller(),
  });

  invariant(outcome.status === 'applied');

  await ctx.memory.store.forget({
    target: { itemID: outcome.itemID, version: 1 },
    provenance: buildMockProvenance(),
  });

  const live = await ctx.readForgetRows();

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await ctx.readForgetRows();

  expect(live).toStrictEqual({
    item: { state: 'forgotten', forgotten_sequence: expect.any(Number) },
    evidence: [{ record_sequence: sequence, item_id: outcome.itemID }],
  });

  expect(rebuilt).toStrictEqual(live);
});

test('it finishes a forget that an earlier release began, with no erasure of its own, at the next start', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.forget_started',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { itemID: item.itemID, version: 1, evidenceSequences: [] },
    },
  ]);

  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const history = await restarted.store.readHistory(item.itemID);

  const records = await readRecords(restarted.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  expect(history).toMatchObject({ state: 'forgotten', versions: [{ status: 'shredded' }] });

  expect(records.map((entry) => entry.record.payload)).toMatchObject([
    { kind: 'memory_item', targetID: item.itemID, by: 'user' },
    { kind: 'memory_item', targetID: item.itemID, removedKeys: 2 },
  ]);

  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ itemID: item.itemID });
});

test('it finishes a forget that a crash cut short at the next start, and starts no second erasure', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  startFaultPointFailure('erasure.keys_removed');

  await ctx.memory.store
    .forget({ target: item, provenance: buildMockProvenance() })
    .catch(() => {});

  const restarted = await startNextTestMemory(ctx.memory, { cleanupSessions: ctx.cleanupSessions });
  const history = await restarted.store.readHistory(item.itemID);

  const records = await readRecords(restarted.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  expect(history).toMatchObject({ state: 'forgotten' });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'erasure.started',
    'erasure.finished',
  ]);
});

test('it removes the moment links of the item when its forget starts', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The bees are back',
    spans: [{ start: 0, end: 17, source: 'typed' }],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: sequence,
    lastSequence: sequence,
    title: 'The bees return',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  const links = await ctx.memory.store.moments.readLinks([item.itemID]);

  expect(links.size).toBe(0);
});

test('it joins the open erasure of an item that is already forgetting, and starts no second erasure', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Keeps bees on the roof' });

  startFaultPointFailure('erasure.keys_removed');

  await ctx.memory.store
    .forget({ target: item, provenance: buildMockProvenance() })
    .catch(() => {});

  const second = ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  await second.catch(() => {});

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['erasure.started', 'erasure.finished'],
  });

  expect(second).resolves.toBeUndefined();

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'erasure.started',
    'erasure.finished',
  ]);
});

test('it counts the fold order that only the item kept alive in the keys of the finish record, and shreds it', async () => {
  const ctx = await setupTest();

  const item = await createMemoryItem(ctx.memory.store, {
    text: 'Keeps bees on the roof',
    labels: { gist: 'bees gist', topic: 'garden', triggers: [] },
  });

  await ctx.memory.store.writes.writeFoldOrder({
    subject: 'owner',
    topic: 'garden',
    order: 'oldest',
    caller: buildMockWriteCaller(),
  });

  await ctx.memory.store.forget({ target: item, provenance: buildMockProvenance() });

  const finished = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['erasure.finished'],
  });

  const folds = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.fold_ordered'],
  });

  expect(finished.map((entry) => entry.record.payload)).toMatchObject([{ removedKeys: 3 }]);
  expect(folds.map((entry) => entry.record.erasable)).toStrictEqual([{ status: 'shredded' }]);
});

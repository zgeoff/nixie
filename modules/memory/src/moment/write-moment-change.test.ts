import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestMemory } from '../test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory };
}

test("it commits the caller's write in the change's transaction", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bread rises overnight now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The overnight loaf',
  });

  invariant(kept.status === 'written');

  const edited = await ctx.memory.store.moments.edit(
    {
      caller: { kind: 'owner' },
      target: { momentID: kept.momentID, version: 1 },
      change: { kind: 'note', note: 'Slow dough tasted better.' },
    },
    async (tx) => {
      await writeRecordsInTransaction(tx, ctx.memory.log, [
        {
          kind: 'task.wake',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'client-action',
          payload: {},
        },
      ]);
    },
  );

  const wakes = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['task.wake'] });

  expect(edited).toMatchObject({ status: 'written', version: 2 });
  expect(wakes).toHaveLength(1);
});

test("it rolls back the caller's write in the change's transaction when it refuses the change", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bread rises overnight now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The overnight loaf',
  });

  invariant(kept.status === 'written');

  const writeWake = mock(async (tx: Parameters<typeof writeRecordsInTransaction>[0]) => {
    await writeRecordsInTransaction(tx, ctx.memory.log, [
      {
        kind: 'task.wake',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'client-action',
        payload: {},
      },
    ]);
  });

  const linked = await ctx.memory.store.moments.link(
    {
      caller: { kind: 'owner' },
      target: { momentID: kept.momentID, version: 1 },
      itemID: '0f6c1d2e-3b4a-4c5d-8e9f-a0b1c2d3e4f5',
      isLinked: true,
    },
    writeWake,
  );

  const wakes = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['task.wake'] });

  expect(linked).toStrictEqual({ status: 'refused', reason: 'item_not_found' });
  expect(writeWake).toHaveBeenCalledOnce();
  expect(wakes).toStrictEqual([]);
});

test('it applies an edit at the version read when only links landed since', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bread rises overnight now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The overnight loaf',
  });

  invariant(kept.status === 'written');

  const item = await ctx.memory.store.remember({
    text: 'Proves dough overnight',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const momentID = kept.momentID;
  const itemID = item.itemID;

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    itemID,
    isLinked: true,
  });

  const edited = await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    change: { kind: 'title', title: 'The slow loaf' },
  });

  expect(edited).toMatchObject({ status: 'written', version: 3 });
});

test('it refuses a link at the version read when an edit landed since', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bread rises overnight now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The overnight loaf',
  });

  invariant(kept.status === 'written');

  const item = await ctx.memory.store.remember({
    text: 'Proves dough overnight',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const momentID = kept.momentID;
  const itemID = item.itemID;

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    change: { kind: 'title', title: 'The slow loaf' },
  });

  const linked = await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    itemID,
    isLinked: true,
  });

  expect(linked).toStrictEqual({ status: 'refused', reason: 'stale' });
});

test('it refuses a retirement at the version read when an edit landed since', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the bread rises overnight now' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The overnight loaf',
  });

  invariant(kept.status === 'written');

  const item = await ctx.memory.store.remember({
    text: 'Proves dough overnight',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const momentID = kept.momentID;
  const itemID = item.itemID;

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    itemID,
    isLinked: true,
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID, version: 2 },
    change: { kind: 'title', title: 'The slow loaf' },
  });

  const retired = await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID, version: 1 },
    isRetired: true,
  });

  expect(retired).toStrictEqual({ status: 'refused', reason: 'stale' });
});

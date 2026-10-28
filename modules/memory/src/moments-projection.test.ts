import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from './moment-types';
import { readMomentRows } from './test-utils/read-moment-rows';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it marks a linked moment destroying and drops its links when its destroy starts', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plum tree needs netting before the birds find it' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Nets the plum tree each summer',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Netting the plum tree',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 2, stage: 'started' },
    },
  ]);

  const rows = await readMomentRows(ctx.db);

  expect(rows.moments).toMatchObject([{ moment_id: kept.momentID, state: 'destroying' }]);
  expect(rows.links).toStrictEqual([]);
});

test('it marks a moment destroyed when its destroy is done, and a rebuild gives the same rows', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plum tree needs netting before the birds find it' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Nets the plum tree each summer',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Netting the plum tree',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 2, stage: 'started' },
    },
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 2, stage: 'done' },
    },
  ]);

  const live = await readMomentRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMomentRows(ctx.db);

  expect(live.moments).toMatchObject([{ moment_id: kept.momentID, state: 'destroyed' }]);
  expect(live.links).toStrictEqual([]);
  expect(rebuilt).toStrictEqual(live);
});

test('it refuses a destroy start for a destroyed moment, and leaves the rows as they were', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the plum tree needs netting before the birds find it' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Netting the plum tree',
  });

  invariant(kept.status === 'written');

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'started' },
    },
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'done' },
    },
  ]);

  const before = await readMomentRows(ctx.db);

  const restart = writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'started' },
    },
  ]);

  await restart.catch(() => {});

  const after = await readMomentRows(ctx.db);

  expect(restart).rejects.toThrow(
    'a moment_destroyed record moves a destroyed moment to destroying',
  );

  expect(after).toStrictEqual(before);
});

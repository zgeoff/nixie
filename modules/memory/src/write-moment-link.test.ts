import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { MomentTables } from './moment-types';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory();

  return { memory, db: memory.writer.db.$extendTables<MomentTables>() };
}

test('it links a memory item to a moment', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const linked = await ctx.memory.store.moments.link({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  invariant(linked.status === 'written');

  const links = await ctx.db.selectFrom('moment_links').selectAll().execute();

  expect(links).toStrictEqual([
    {
      link_key: `${kept.momentID}:${item.itemID}`,
      moment_id: kept.momentID,
      item_id: item.itemID,
      linked_sequence: linked.sequence,
    },
  ]);
});

test('it removes a link', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    itemID: item.itemID,
    isLinked: false,
  });

  const links = await ctx.db.selectFrom('moment_links').selectAll().execute();

  expect(links).toStrictEqual([]);
});

test('it refuses a link to an item the store never held', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const linked = await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: '0e3b7c41-5d2a-4f8e-b6c9-1a2b3c4d5e6f',
    isLinked: true,
  });

  expect(linked).toStrictEqual({ status: 'refused', reason: 'item_not_found' });
});

test('it refuses a second link to the same item', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  const linked = await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    itemID: item.itemID,
    isLinked: true,
  });

  expect(linked).toStrictEqual({ status: 'refused', reason: 'already_linked' });
});

test('it drops the link when its item is forgotten', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    itemID: item.itemID,
    isLinked: true,
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const links = await ctx.db.selectFrom('moment_links').selectAll().execute();

  expect(links).toStrictEqual([]);
});

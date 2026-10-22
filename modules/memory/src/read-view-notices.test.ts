import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer()) },
  });

  return { memory };
}

test("it reads a turn's notice with each item as it now stands", async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I swim at dawn and I keep bees',
    spans: [{ start: 0, end: 30, source: 'typed' }],
  });

  const swims = await ctx.memory.store.writes.remember({
    text: 'Swims at dawn',
    quote: 'I swim at dawn',
    caller: buildMockWriteCaller(),
  });

  const bees = await ctx.memory.store.writes.remember({
    text: 'Keeps bees',
    quote: 'I keep bees',
    caller: buildMockWriteCaller(),
  });

  invariant(swims.status === 'applied' && bees.status === 'applied');

  await ctx.memory.store.retire({
    target: { itemID: bees.itemID, version: 1 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const notices = await ctx.memory.store.view.readNotices('conversation');

  expect(notices).toMatchObject([
    {
      noticeKey: `turn/conversation/${String(sequence)}`,
      kind: 'turn',
      messageSequence: sequence,
      remembered: 2,
      retired: 0,
      proposed: 0,
      entries: [
        {
          itemID: swims.itemID,
          change: 'created',
          version: 1,
          item: { version: 1, state: 'active', change: 'created', text: 'Swims at dawn' },
        },
        {
          itemID: bees.itemID,
          change: 'created',
          version: 1,
          item: { version: 2, state: 'retired', change: 'retired', text: 'Keeps bees' },
        },
      ],
    },
  ]);
});

test("it reads a writer batch's notice with each version it applied", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Bakes sourdough on Saturdays',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: null,
    },
  });

  const [record] = await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.notice',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        notice: 'batch',
        versions: [{ itemID: item.itemID, version: item.version }],
        count: 1,
        isQuiet: true,
      },
    },
  ]);

  const notices = await ctx.memory.store.view.readNotices('conversation');

  invariant(record);

  expect(notices).toMatchObject([
    {
      kind: 'batch',
      messageSequence: null,
      sequence: record.sequence,
      remembered: 1,
      retired: 0,
      proposed: 0,
      entries: [
        {
          itemID: item.itemID,
          change: 'created',
          version: 1,
          sequence: record.sequence,
          item: { version: 1, text: 'Bakes sourdough on Saturdays' },
        },
      ],
    },
  ]);
});

test('it reads the end of the catch-up as a count with no entries', async () => {
  const ctx = await setupTest();

  const [record] = await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.notice',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { notice: 'catch_up', versions: [], count: 12, isQuiet: true },
    },
  ]);

  const notices = await ctx.memory.store.view.readNotices('conversation');

  invariant(record);

  expect(notices).toStrictEqual([
    {
      noticeKey: `notice/${String(record.sequence)}`,
      kind: 'catch_up',
      messageSequence: null,
      sequence: record.sequence,
      remembered: 12,
      retired: 0,
      proposed: 0,
      entries: [],
    },
  ]);
});

test('it reads no notice for a thread with no writes', async () => {
  const ctx = await setupTest();
  const notices = await ctx.memory.store.view.readNotices('conversation');

  expect(notices).toStrictEqual([]);
});

test('it reads a proposed entry with no item while its item does not exist yet', async () => {
  const ctx = await setupTest();

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Remind me later',
    spans: [{ start: 0, end: 15, source: 'typed' }],
  });

  await ctx.memory.store.writes.remember({ text: 'Likes jazz', caller: buildMockWriteCaller() });

  const notices = await ctx.memory.store.view.readNotices('conversation');

  expect(notices).toMatchObject([
    { proposed: 1, entries: [{ change: 'proposed', version: null, item: null }] },
  ]);
});

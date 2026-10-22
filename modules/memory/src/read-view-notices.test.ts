import { expect, test } from 'bun:test';
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

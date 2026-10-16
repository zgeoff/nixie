import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readHeldMessages } from './read-held-messages';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it holds your messages in the thread from the mark the newest opening kept', async () => {
  const ctx = await setupTest();

  const [, kept] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The boiler clanks at night' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The radiator stays cold' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'garden',
      erasable: { text: 'The tomatoes need staking' },
    },
  ]);

  invariant(kept);

  const [, latest] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { heldFrom: kept.sequence },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Booked the furnace check' },
    },
  ]);

  invariant(latest);

  const held = await readHeldMessages(ctx.tasks.context, {
    taskID: 'conversation',
    isNewSession: false,
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'UTC', now: new Date() },
  });

  expect(held).toStrictEqual([kept.sequence, latest.sequence]);
});

test('it holds every message in the thread for an opening recorded before openings kept the mark', async () => {
  const ctx = await setupTest();

  const [first, second] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The boiler clanks at night' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The radiator stays cold' },
    },
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  invariant(first && second);

  const held = await readHeldMessages(ctx.tasks.context, {
    taskID: 'conversation',
    isNewSession: false,
    beforeSequence: Number.MAX_SAFE_INTEGER,
    rebuildTokens: 30_000,
    times: { defaultZone: 'UTC', now: new Date() },
  });

  expect(held).toStrictEqual([first.sequence, second.sequence]);
});

test('it holds a new session the messages its recent turns reach back to within the budget', async () => {
  const ctx = await setupTest();

  const [, recent, pending] = await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The boiler clanks at night, mostly after ten, and wakes the whole house' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Cold radiator' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'When is the heating engineer coming?' },
    },
  ]);

  invariant(recent && pending);

  const held = await readHeldMessages(ctx.tasks.context, {
    taskID: 'conversation',
    isNewSession: true,
    beforeSequence: pending.sequence,

    // room for the short recent message's line and not the long one before it
    rebuildTokens: 20,
    times: { defaultZone: 'UTC', now: new Date() },
  });

  expect(held).toStrictEqual([recent.sequence, pending.sequence]);
});

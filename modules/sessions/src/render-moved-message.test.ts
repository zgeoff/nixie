import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { renderMovedMessage } from './render-moved-message';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  return { log: tasks.context.log };
}

test('it tells the task that lost a message to leave it to the task that gained it', async () => {
  const ctx = await setupTest();

  const [moved] = await writeRecords(ctx.log, [
    {
      kind: 'task.message_moved',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        message: 12,
        messageThread: 'conversation',
        from: 'conversation',
        to: 'k3x9m2p7qa',
      },
    },
  ]);

  invariant(moved);

  const text = renderMovedMessage(
    moved,
    null,
    { defaultZone: 'UTC', now: new Date('2026-10-14T09:00:00Z') },
    buildMockTaskMessageView({
      messaging: {
        directory: [
          {
            taskID: 'k3x9m2p7qa',
            name: 'Garden plan',
            brief: 'Plan the beds.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
    }),
  );

  expect(text).toMatch(
    /^<system-message type="message-moved" id="[\da-f]{12}" at="[^"]+">\nRobin moved their message #12 to Garden plan, which answers it now\. Leave it to that task\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});

test('it gives the task that gained a message the message itself, as if it had come there first', async () => {
  const ctx = await setupTest();

  const [original, moved] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Put the beans in the north bed.' },
    },
    {
      kind: 'task.message_moved',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        message: 1,
        messageThread: 'conversation',
        from: 'conversation',
        to: 'k3x9m2p7qa',
      },
    },
  ]);

  invariant(original && moved);

  const text = renderMovedMessage(
    moved,
    original,
    { defaultZone: 'UTC', now: new Date('2026-10-14T09:00:00Z') },
    buildMockTaskMessageView({
      messaging: {
        directory: [
          {
            taskID: 'conversation',
            name: 'Conversation',
            brief: 'Talks with Robin.',
            isWokenByMessages: true,
          },
        ],
        hopLimit: 20,
        ownerName: 'Robin',
      },
    }),
  );

  expect(text).toMatch(
    /^<system-message type="message-moved" id="[\da-f]{12}" at="[^"]+">\nRobin moved their message #1 to you from Conversation, as if it had come to you first\. Answer it\.\n<\/system-message id="[\da-f]{12}">\n\n\[#\d+ · [^\]]+\] Put the beans in the north bed\.$/u,
  );
});

test('it tells the task that gained a forgotten message that the message is gone', async () => {
  const ctx = await setupTest();

  const [moved] = await writeRecords(ctx.log, [
    {
      kind: 'task.message_moved',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        message: 12,
        messageThread: 'conversation',
        from: 'conversation',
        to: 'k3x9m2p7qa',
      },
    },
  ]);

  invariant(moved);

  const text = renderMovedMessage(
    moved,
    null,
    { defaultZone: 'UTC', now: new Date('2026-10-14T09:00:00Z') },
    buildMockTaskMessageView(),
  );

  expect(text).toEndWith('\n\n[a message you sent, since forgotten]');
});

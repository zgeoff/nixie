import { expect, onTestFinished, test } from 'bun:test';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readLiveInbox } from './read-live-inbox';
import { buildMockTaskMessageView } from './test-utils/build-mock-task-message-view';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  const tasks = await startTestTasks();

  const controller = new AbortController();

  onTestFinished(() => {
    controller.abort();
  });

  return { ...tasks, signal: controller.signal };
}

test('it yields a message that lands during the turn and adds its images to the session', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const images = {
    spent: { bytes: 8, count: 1 },
    budget: { bytes: 16, count: 100 },
    isCapped: false,
  };

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The second shelf.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.text).toEndWith('The second shelf.');

  expect(images).toStrictEqual({
    spent: { bytes: 16, count: 2 },
    budget: { bytes: 16, count: 100 },
    isCapped: false,
  });
});

test('it ends the feed at a message whose images would pass the session budget', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const images = {
    spent: { bytes: 12, count: 1 },
    budget: { bytes: 16, count: 100 },
    isCapped: false,
  };

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'The second shelf.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const next = await live.next();

  expect(next.done).toBeTrue();

  expect(images).toStrictEqual({
    spent: { bytes: 12, count: 1 },
    budget: { bytes: 16, count: 100 },
    isCapped: true,
  });
});

test('it ends the feed at a message whose images would pass the session count', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const images = {
    spent: { bytes: 800, count: 100 },
    budget: { bytes: 24 * 1024 * 1024, count: 100 },
    isCapped: false,
  };

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/png' }] },
      erasable: { text: 'One more icon.' },
      attachments: [new Uint8Array(6).fill(1)],
    },
  ]);

  const next = await live.next();

  expect(next.done).toBeTrue();
  expect(images.isCapped).toBeTrue();
});

test('it yields a message with no images past a spent session budget', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const images = {
    spent: { bytes: 16, count: 2 },
    budget: { bytes: 16, count: 100 },
    isCapped: false,
  };

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Which one fits?' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.text).toEndWith('Which one fits?');
});

import { expect, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { buildTurnSilence } from '../utils/build-turn-silence';
import { readLiveInbox } from './read-live-inbox';

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
    silence: buildTurnSilence([]),
    log: () => {},
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

  expect(next.value.text).toInclude('The second shelf.');

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
    silence: buildTurnSilence([]),
    log: () => {},
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
    silence: buildTurnSilence([]),
    log: () => {},
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
    silence: buildTurnSilence([]),
    log: () => {},
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

  expect(next.value.text).toInclude('Which one fits?');
});

test('it ends the feed at a message that lands after the turn ended silently, and leaves it unsent', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const sent = new Set([0]);

  const events: unknown[] = [];
  const silence = buildTurnSilence([]);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent,
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence,
    log: (event, fields) => {
      events.push({ event, fields });
    },
  });

  silence.end();

  const [record] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Still there?' },
    },
  ]);

  const next = await live.next();

  expect({ isDone: next.done, sent: [...sent], events }).toStrictEqual({
    isDone: true,
    sent: [0],
    events: [
      {
        event: 'session.live_message_held',
        fields: { taskID: 'conversation', sequence: record?.sequence },
      },
    ],
  });
});

test("it counts an owner message that lands during the turn against the turn's silent end", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const silence = buildTurnSilence([]);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence,
    log: () => {},
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Still there?' },
    },
  ]);

  await live.next();

  expect(silence.end()).toBe('refused');
});

test('it passes over a record of a kind no module registers and yields the next message', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence: buildTurnSilence([]),
    log: () => {},
  });

  await writeRecords(ctx.context.log, [
    {
      // @ts-expect-error -- no module registers this kind
      kind: 'harbour.unknown_kind',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { tide: 'high' },
    },
  ]);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The second shelf.' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.text).toInclude('The second shelf.');
});

test("it passes over a fire on the task's own thread that lands during the turn, neither sending it nor taking it as sent, and goes on to the message behind it", async () => {
  const ctx = await setupTest();

  const sent = new Set([0]);

  const live = readLiveInbox(ctx.context, {
    taskID: 'water-the-tomatoes',
    sent,
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence: buildTurnSilence([]),
    log: () => {},
  });

  const fire = await writeTestTriggerFire(ctx.context, 'water-the-tomatoes', {
    definitionHash: 'hash-1',
  });

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      erasable: { text: 'Skip the front bed.' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.text).toInclude('Skip the front bed.');
  expect(sent.has(fire)).toBeFalse();
  expect(sent.has(message?.sequence ?? 0)).toBeTrue();
});

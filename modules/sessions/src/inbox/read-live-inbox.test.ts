import { expect, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { buildTurnSilence } from '../utils/build-turn-silence';
import { makeGapReader } from './make-gap-reader';
import { readLiveInbox } from './read-live-inbox';

async function setupTest() {
  const tasks = await startTestTasks({ recordsAtMs: Date.parse('2026-11-21T00:00:00Z') });

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
    canCut: false,
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

  expect(next.value.message.text).toInclude('The second shelf.');

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
    canCut: false,
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
    canCut: false,
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
    canCut: false,
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

  expect(next.value.message.text).toInclude('Which one fits?');
});

test('it ends the feed at a message that lands after the turn ended silently, and leaves it unsent', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const sent = new Set([0]);

  const events: unknown[] = [];
  const silence = buildTurnSilence([]);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    canCut: false,
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
    canCut: false,
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
    canCut: false,
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

  expect(next.value.message.text).toInclude('The second shelf.');
});

test("it passes over a fire on the task's own thread that lands during the turn, neither sending it nor taking it as sent, and goes on to the message behind it", async () => {
  const ctx = await setupTest();

  const sent = new Set([0]);

  const live = readLiveInbox(ctx.context, {
    taskID: 'water-the-tomatoes',
    canCut: false,
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

  expect(next.value.message.text).toInclude('Skip the front bed.');
  expect(sent.has(fire)).toBeFalse();
  expect(sent.has(message?.sequence ?? 0)).toBeTrue();
});

test('it marks an owner message as cutting a call when the harness can cut', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    canCut: true,
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence: buildTurnSilence([]),
    log: () => {},
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Stop and look.' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.cutsCall).toBeTrue();
});

test('it does not mark an owner message as cutting a call when the harness cannot cut', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    canCut: false,
    sent: new Set([0]),
    signal: ctx.signal,
    view: buildMockTaskMessageView(),
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
    silence: buildTurnSilence([]),
    log: () => {},
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Stop and look.' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.cutsCall).toBeFalse();
});

test('it does not mark a task message as cutting a call, even when the harness can cut', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const live = readLiveInbox(ctx.context, {
    taskID: 'conversation',
    canCut: true,
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
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'm7k2',
        from: 't4m2',
        to: 'conversation',
        kind: 'request',
        replyTo: null,
        onBehalfOf: [],
        hop: 0,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: 'task:t4m2',
      },
      erasable: { body: 'Found 3 quiet cafes near the station.' },
    },
  ]);

  const next = await live.next();

  invariant(next.done !== true, 'the feed ended before the message');

  expect(next.value.cutsCall).toBeFalse();
});

test.each([
  { canCut: true, tag: 'with its own gaps' },
  { canCut: false, tag: 'with no gaps' },
])(
  'it renders an owner message that lands during the turn $tag when canCut is $canCut',
  async (row) => {
    const ctx = await setupTest();

    const definitions = { snapshotHash: 'sha256:test' };

    await createConversationTask(ctx.context);

    const [earlier] = await writeRecords(ctx.context.log, [
      {
        kind: 'owner_message',
        definitions,
        thread: 'conversation',
        erasable: { text: 'Earlier.' },
      },
    ]);

    invariant(earlier, 'the earlier message was not written');

    ctx.clock.advance(2 * 60_000);

    await writeRecords(ctx.context.log, [
      { kind: 'model.turn_ended', definitions, thread: 'conversation' },
    ]);

    const live = readLiveInbox(ctx.context, {
      taskID: 'conversation',
      canCut: row.canCut,
      sent: new Set([0, earlier.sequence]),
      signal: ctx.signal,
      view: buildMockTaskMessageView(),
      times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
      images: { spent: { bytes: 0, count: 0 }, budget: { bytes: 16, count: 100 }, isCapped: false },
      silence: buildTurnSilence([]),
      gaps: makeGapReader(ctx.context),
      log: () => {},
    });

    ctx.clock.advance(10 * 60_000);

    await writeInboxRecords(ctx.context, [
      {
        kind: 'owner_message',
        definitions,
        thread: 'conversation',
        erasable: { text: 'Stop and look.' },
      },
    ]);

    const next = await live.next();

    invariant(next.done !== true, 'the feed ended before the message');

    const [opening] = next.value.message.text.split('\n');

    expect(opening?.includes('since-your-last-turn="10 min" since-owner-last-wrote="12 min"')).toBe(
      row.canCut,
    );
  },
);

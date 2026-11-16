import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { buildMockTaskMessageView } from '../test-utils/build-mock-task-message-view';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readTurnBatch } from './read-turn-batch';

async function setupTest() {
  const tasks = await startTestTasks();

  return { log: tasks.context.log, context: tasks.context };
}

test('it takes the oldest 64 records of a longer inbox', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(
    ctx.log,
    Array.from({ length: 65 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Note ${index + 1}` },
    })),
  );

  const batch = await readTurnBatch(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual(records.slice(0, 64));
  expect(batch.messages).toHaveLength(64);
});

test('it leaves a record for the next turn when its images would pass 24 MiB with the ones before', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(
    ctx.log,
    Array.from({ length: 2 }, (_, index) => ({
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { images: [{ mediaType: 'image/jpeg' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: `Photos ${index + 1}` },
      attachments: [new Uint8Array(5 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)],
    })),
  );

  const batch = await readTurnBatch(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual(records.slice(0, 1));
  expect(batch.messages.map((message) => message.images?.length)).toStrictEqual([2]);
});

test('it takes a fire on the thread of a task as a silent record in order, and keeps the records and messages matched around it', async () => {
  const ctx = await setupTest();

  const [first, fire, second] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      erasable: { text: 'First note.' },
    },
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'key-1',
        kind: 'schedule',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      erasable: { text: 'Second note.' },
    },
  ]);

  invariant(first && fire && second);

  const batch = await readTurnBatch(ctx.context, [first, fire, second], {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual([first, fire, second]);
  expect(batch.silent).toStrictEqual([fire]);

  expect(batch.messages.map((message) => message.text)).toStrictEqual([
    expect.toInclude('First note.'),
    expect.toInclude('Second note.'),
  ]);
});

test('it takes a lone fire on the thread of a task as a batch of one silent record with no message', async () => {
  const ctx = await setupTest();

  const records = await writeRecords(ctx.log, [
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'key-1',
        kind: 'schedule',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  const batch = await readTurnBatch(ctx.context, records, {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch).toStrictEqual({ records, silent: records, messages: [] });
});

test('it stops a batch with a silent record before the message whose images pass the budget, and takes the silent record before it', async () => {
  const ctx = await setupTest();

  const [fireRecord, first, second] = await writeRecords(ctx.log, [
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'key-1',
        kind: 'schedule',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: { images: [{ mediaType: 'image/jpeg' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Photos 1' },
      attachments: [new Uint8Array(5 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)],
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: { images: [{ mediaType: 'image/jpeg' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Photos 2' },
      attachments: [new Uint8Array(5 * 1024 * 1024), new Uint8Array(5 * 1024 * 1024)],
    },
  ]);

  invariant(fireRecord && first && second);

  const batch = await readTurnBatch(ctx.context, [fireRecord, first, second], {
    times: { defaultZone: 'Australia/Sydney', now: new Date('2026-10-13T05:00:00Z') },
    view: buildMockTaskMessageView(),
    imageBudget: { bytes: 24 * 1024 * 1024, count: 100 },
  });

  expect(batch.records).toStrictEqual([fireRecord, first]);
  expect(batch.messages).toHaveLength(1);
});

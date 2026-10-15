import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { readSessionMarks } from './read-session-marks';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads no earlier core and no invalidation before the first turn', async () => {
  const ctx = await setupTest();
  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks).toStrictEqual({
    previousCore: null,
    isInvalidated: false,
    invalidatedThrough: 0,
    hasOpening: false,
    lastContext: null,
    isSummarized: false,
    compactionFailures: 0,
    images: { bytes: 0, count: 0 },
  });
});

test('it reads the images the session held after the last turn', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { sessionImageBytes: 4_200_000, sessionImageCount: 7 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.images).toStrictEqual({ bytes: 4_200_000, count: 7 });
});

test('it reads a session whose turn recorded its image bytes and no count as holding 100 images', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { sessionImageBytes: 4_200_000 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.images).toStrictEqual({ bytes: 4_200_000, count: 100 });
});

test('it reads no images from a turn that recorded no image bytes and no count of them', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { sessionImageBytes: 0 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.images).toStrictEqual({ bytes: 0, count: 0 });
});

test('it reads no images from a turn that recorded none', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { contextSize: 120_000, contextWindow: 200_000 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.images).toStrictEqual({ bytes: 0, count: 0 });
});

test('it reads the context the last turn ended with and its window', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { contextSize: 120_000, contextWindow: 200_000 },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { contextSize: 165_000, contextWindow: 200_000 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.lastContext).toStrictEqual({ size: 165_000, window: 200_000 });
});

test('it reads the session as summarized when a summary committed after the last opening', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 1 },
      erasable: { text: 'Open threads: the gauge report.' },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.isSummarized).toBe(true);
});

test('it reads the session as not summarized once a session opened from the summary', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'Open threads: the gauge report.' },
    },
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.isSummarized).toBe(false);
});

test('it counts the compactions that failed in a row from the newest failure', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'model.compaction_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { trigger: 'threshold', failures: 2 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.compactionFailures).toBe(2);
});

test('it counts no failure in a row once a summary committed after the last failure', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.compaction_failed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { trigger: 'threshold', failures: 1 },
    },
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0 },
      erasable: { text: 'Open threads: the gauge report.' },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.compactionFailures).toBe(0);
});

test('it reads that a session opened with an opening record', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.hasOpening).toBe(true);
});

test('it reads the pinned core the last turn ran with', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { pinnedCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 1 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { pinnedCore: [{ itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 2 }] },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.previousCore).toStrictEqual([
    { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01', version: 2 },
  ]);
});

test('it reads an empty core from a turn recorded before the core reached the prompt', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { turns: 1 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.previousCore).toStrictEqual([]);
});

test('it reads the session as invalidated when a forget invalidated it after the last turn', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.isInvalidated).toBe(true);
});

test('it reads the session as valid once a turn that saw the invalidation ended', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { invalidatedThrough: 1 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks).toMatchObject({ isInvalidated: false, invalidatedThrough: 1 });
});

test('it keeps the session invalidated when a turn that began before the invalidation commits after it', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { invalidatedThrough: 0 },
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.isInvalidated).toBe(true);
});

test('it reads the session as valid after the invalidation when the last turn kept no mark', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_invalidated',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { itemID: '0b4f4c8e-3d0a-4c39-9a51-6f1f1f2b8c01' },
    },
    {
      kind: 'model.turn_ended',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
    },
  ]);

  const marks = await readSessionMarks(ctx.tasks.context, 'conversation');

  expect(marks.isInvalidated).toBe(false);
});

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

  expect(marks).toStrictEqual({ previousCore: null, isInvalidated: false, invalidatedThrough: 0 });
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

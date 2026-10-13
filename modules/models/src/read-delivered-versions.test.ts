import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import { readDeliveredVersions } from './read-delivered-versions';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it lists every version recalled in a step that ended its turn', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);
  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:1', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-2', version: 3 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([
    { itemID: 'item-1', version: 1 },
    { itemID: 'item-2', version: 3 },
  ]);
});

test('it leaves out a recall from a step that never ended its turn', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);
  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:2', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:3', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-2', version: 1 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-2', version: 1 }] },
    },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([{ itemID: 'item-2', version: 1 }]);
});

test('it lists nothing that a step delivered before a rebuild', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);
  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:1', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:2', generation: 1 },
    },
    {
      kind: 'model.session_rebuilt',
      definitions,
      thread: 'conversation',
      payload: { reason: 'missing' },
    },
    { kind: 'model.turn_ended', definitions, thread: 'conversation', payload: { retrieved: [] } },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([]);
});

test('it keeps what a rebuilt turn retrieved and drops the recall for the session it lost', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);
  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:1', generation: 1 },
    },

    // the retrieval for the resume that found its session lost, then the one for the new session
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-2', version: 1 }] },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'model.session_rebuilt',
      definitions,
      thread: 'conversation',
      payload: { reason: 'missing' },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([{ itemID: 'item-1', version: 1 }]);
});

test('it lists nothing that a step delivered before a compaction in that step', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);
  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:6', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'task.step_started',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:7', generation: 1 },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-2', version: 1 }] },
    },
    { kind: 'model.compacted', definitions, thread: 'conversation', payload: {} },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-2', version: 1 }] },
    },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([]);
});

test('it lists nothing that another thread delivered', async () => {
  const ctx = await setupTest();
  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'task-9',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'task-9',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
  ]);

  const delivered = await readDeliveredVersions(ctx.tasks.context, 'conversation');

  expect(delivered).toStrictEqual([]);
});

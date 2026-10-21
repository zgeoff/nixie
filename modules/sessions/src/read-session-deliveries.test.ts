import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readSessionDeliveries } from './read-session-deliveries';
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

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([
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

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-2', version: 1 }]);
});

test('it lists nothing that a step delivered before a session opened', async () => {
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
      kind: 'model.session_opened',
      definitions,
      thread: 'conversation',
      payload: { kind: 'rebuild', reason: 'lost' },
    },
    { kind: 'model.turn_ended', definitions, thread: 'conversation', payload: { retrieved: [] } },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([]);
});

test('it keeps what a turn on a session opened in place of a lost one retrieved, and drops the recall for the lost session', async () => {
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
      payload: { items: [{ itemID: 'item-2', version: 1 }] },
    },
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-1', version: 1 }] },
    },
    {
      kind: 'model.session_opened',
      definitions,
      thread: 'conversation',
      payload: { kind: 'rebuild', reason: 'lost' },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-1', version: 1 }] },
    },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-1', version: 1 }]);
});

test('it keeps the recalls a lost session opening made after its mark, such as a replayed approval', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);

  const [, lostRecall] = await writeRecords(ctx.tasks.context.log, [
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
      payload: { items: [{ itemID: 'item-2', version: 1 }] },
    },
  ]);

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'memory.recalled',
      definitions,
      thread: 'conversation',
      payload: { items: [{ itemID: 'item-3', version: 1 }] },
    },
    {
      kind: 'model.session_opened',
      definitions,
      thread: 'conversation',
      payload: { kind: 'rebuild', reason: 'lost', recalledThrough: lostRecall?.sequence ?? 0 },
    },
    { kind: 'model.turn_ended', definitions, thread: 'conversation', payload: { retrieved: [] } },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-3', version: 1 }]);
});

test('it reads a rebuild record from before opening records as the opening of a lost session', async () => {
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

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-1', version: 1 }]);
});

test.each([
  ['a first session', { kind: 'first', reason: null }],
  ['a rebuild after a forget', { kind: 'rebuild', reason: 'forget' }],
])('it keeps every recall of a turn on %s', async (_start, payload) => {
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
    { kind: 'model.session_opened', definitions, thread: 'conversation', payload },
    { kind: 'model.turn_ended', definitions, thread: 'conversation', payload: { retrieved: [] } },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-1', version: 1 }]);
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

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([]);
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

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([]);
});

test('it leaves out a recall that came after the last result its turn ended at', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);

  const [, settled] = await writeRecords(ctx.tasks.context.log, [
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
  ]);

  invariant(settled);

  await writeRecords(ctx.tasks.context.log, [
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
      payload: { retrieved: [], recalledThrough: settled.sequence },
    },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-1', version: 1 }]);
});

test('it keeps a recall that came after a compaction in the same step', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);

  const [, summarized, held] = await writeRecords(ctx.tasks.context.log, [
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
      payload: { items: [{ itemID: 'item-2', version: 2 }] },
    },
  ]);

  invariant(summarized && held);

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.compacted',
      definitions,
      thread: 'conversation',
      payload: { recalledThrough: summarized.sequence },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [{ itemID: 'item-3', version: 1 }], recalledThrough: held.sequence },
    },
  ]);

  const delivered = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(delivered.versions).toStrictEqual([{ itemID: 'item-2', version: 2 }]);
});

test('it lists the past messages each ended turn of the session placed', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.session_opened',
      definitions,
      thread: 'conversation',
      payload: { heldFrom: 1 },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [], retrievedMessages: [4, 9] },
    },
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [], retrievedMessages: [12] },
    },
  ]);

  const deliveries = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(deliveries.messages).toStrictEqual([4, 9, 12]);
});

test('it drops the past messages an earlier session placed once an invalidation ends it', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await createConversationTask(ctx.tasks.context);

  await writeRecords(ctx.tasks.context.log, [
    {
      kind: 'model.turn_ended',
      definitions,
      thread: 'conversation',
      payload: { retrieved: [], retrievedMessages: [4, 9] },
    },
    {
      kind: 'model.session_invalidated',
      definitions,
      thread: 'conversation',
    },
  ]);

  const deliveries = await readSessionDeliveries(ctx.tasks.context, 'conversation');

  expect(deliveries.messages).toStrictEqual([]);
});

import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readTurnRecalledThrough } from './read-turn-recalled-through';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads the newest recall before the interrupt of the step', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  const [read] = await writeRecords(ctx.tasks.context.log, [
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
    {
      kind: 'task.interrupted',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:2' },
    },
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
  ]);

  invariant(read);

  const through = await readTurnRecalledThrough(ctx.tasks.context, {
    taskID: 'conversation',
    stepKey: 'conversation:2',
  });

  expect(through).toBe(read.sequence);
});

test('it reads the newest recall when the interrupt belongs to another step', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  const written = await writeRecords(ctx.tasks.context.log, [
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
    {
      kind: 'task.interrupted',
      definitions,
      thread: 'conversation',
      payload: { taskID: 'conversation', stepKey: 'conversation:1' },
    },
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
  ]);

  const newest = written.at(-1);

  invariant(newest);

  const through = await readTurnRecalledThrough(ctx.tasks.context, {
    taskID: 'conversation',
    stepKey: 'conversation:2',
  });

  expect(through).toBe(newest.sequence);
});
